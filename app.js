var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

var neo4j = require('neo4j-driver').v1;

let uri = "bolt://localhost:7687";
let user = "neo4j";
let password = "10381417";
const driver = neo4j.driver( uri, neo4j.auth.basic( user, password ));
const session = driver.session();

const db = {
    getAllNodes: function(){
        return new Promise( ( resolve, reject ) => {
            session.run( "MATCH (n) WHERE NOT n:FilterTag AND NOT n:Organigramm RETURN n" ).then( ( resp ) => {
                // console.log(resp.records[0]._fields);
                // console.log(resp.records.length);
                session.close();
                driver.close();
                let nodes = [];
                for( let i = 0; i < resp.records.length; i++ ){
                    nodes[i] = resp.records[i]._fields[0];
                }
                resolve( nodes );
            }).catch( ( err ) => {
                reject( err );
            });
        });
    },
    getAllRelations: function(){
        return new Promise( ( resolve, reject ) => {
            session.run( "MATCH (n)-[r]->(m) where not n:Organigramm RETURN r" ).then( ( resp ) => {
                session.close();
                driver.close();
                let relations = [];
                for( let i = 0; i < resp.records.length; i++ ){
                    relations[i] = resp.records[i]._fields[0];
                }
                resolve( relations );
            }).catch( ( err ) => {
                reject( err );
            });
        });
    },
    getNodesByLabel: function( labelName ) {
        return new Promise( ( resolve, reject ) => {
            session.run( "MATCH (n) WHERE n:"  + labelName + " RETURN n" ).then( ( resp ) => {
                session.close();
                driver.close();
                let nodes = [];
                for( let i = 0; i < resp.records.length; i++ ){
                    nodes[i] = resp.records[i]._fields[0];
                }
                resolve( nodes );
            }).catch( ( err ) => {
                reject( err );
            });
        });
    },
    getRelationsByLabel: function( labelName ) {
        return new Promise( ( resolve, reject ) => {
            session.run( "MATCH (n)-[r]->() WHERE n:"  + labelName + " RETURN r" ).then( ( resp ) => {
                session.close();
                driver.close();
                let links = [];
                for( let i = 0; i < resp.records.length; i++ ){
                    links[i] = resp.records[i]._fields[0];
                }
                resolve( links );
            }).catch( ( err ) => {
                reject( err );
            });
        });
    },
    // getAllLabels: function() { deprecated
    //     return new Promise( ( resolve, reject ) => {
    //         session.run( "MATCH (n) WHERE NOT n:FilterTag RETURN distinct labels(n)" ).then( ( resp ) => {
    //             let labels = [];
    //             let promises = [];
    //             for( let i=0; i< resp.records.length; i++ ){
    //                 for(let j=0; j< resp.records[i]._fields[0].length; j++){
    //                     labels.push(resp.records[i]._fields[0][j])
    //                 }
    //             }
    //             // remove duplicates and sort
    //             let labelArr = Array.from( new Set( labels ) ).sort();
    //             // get label counts
    //             for(let k=0; k < labelArr.length; k++){
    //                 promises.push( session.run( "MATCH (n:" + labelArr[k] + ") return size(collect(n))" ) );
    //             }
    //             Promise.all(promises).then(function(resp){
    //                 session.close();
    //                 driver.close();
    //                 let labelCounts = [];
    //                 // loop through the multiple responses produced by the promise.all() procedure
    //                 for( let l = 0; l < resp.length; l++ ){
    //                     labelCounts.push(resp[l].records[0]._fields[0].low);
    //                 }
    //                 resolve( { tags: labelArr, counts: labelCounts } );
    //             }).catch( ( err ) => {
    //                 reject( err );
    //             });
    //         }).catch( (err) => {
    //             reject( err );
    //         });
    //     });
    // },
    getAllProperties: function() {
        return new Promise( ( resolve, reject ) => {
            session.run( "MATCH (a) WHERE NOT a:FilterTag AND NOT a:Organigramm UNWIND keys(a) AS key WITH DISTINCT key ORDER by key RETURN collect(key)").then( ( resp ) => {
                session.close();
                driver.close();
                let properties = [];
                properties = resp.records[0]._fields[0];
                resolve( properties );
            }).catch( ( err ) => {
                reject( err );
            }); // session.run
        });
    },
    getAllPropertyValues: function( properties ){
        let promiseArr = [];
        for( let i = 0; i < properties.length; i++ ){
            if( properties[i] != "name" && properties[i] != "kürzel" && properties[i] != "desc" && properties[i] != "email" && properties[i] != "web" ){
                promiseArr.push( new Promise( (resolve, reject) => {
                        session.run( "MATCH (n) RETURN collect(distinct (n)." + properties[i] + ")" ).then( ( resp ) => {
                            resolve( { prop: properties[i], values:  Array.from( new Set( [].concat( ...resp.records[0]._fields[0] ) ) ), } );
                        }).catch( (err) => {
                            reject(err);
                        });
                    })
                ); //push()
            }
        }
        return new Promise( ( resolve, reject ) => {
            Promise.all(promiseArr).then( (resp) => {
                session.close();
                driver.close();
                resolve( resp );
            }).catch( ( err ) => { reject( err ) } );
        });
    },
    getFilterTags: function( ) {
        return new Promise ( (resolve, reject ) => {
            session.run( "MATCH (n:FilterTag) RETURN n" ).then( resp => {
                session.close();
                driver.close( );
                let filterTags = [];
                respFields = resp.records;
                for ( let i = 0; i < resp.records.length; i++ ){
                    filterTags.push( {
                        name: resp.records[i]._fields[0].properties.name,
                        defaultVisibility: resp.records[i]._fields[0].properties.defaultVisibility,
                    } );
                }
                // sort filterTags alphabetically
                filterTags.sort( ( a, b ) => ( a.name.localeCompare( b.name ) ) );
                // get the tag counts
                let promises = [];
                for( let j = 0; j < filterTags.length; j++ ){
                    promises.push( session.run( "MATCH (n:" + filterTags[j].name + ") return size(collect(n))" ) ); 
                }
                Promise.all(promises).then( (resp) => {
                    let recordsArr = [];
                    for (let k = 0; k < resp.length; k++){
                        filterTags[k].count = resp[k].records[0]._fields[0].low;
                    }
                    resolve( filterTags );
                } );
            }).catch( err => {
                reject( err );
            });
        } );
    },
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use( logger('dev') );
app.use( express.json() );
app.use( express.urlencoded( { extended: false } ) );
app.use( cookieParser() );
app.use( express.static( path.join( __dirname, 'public' ) ) );

app.use('/', indexRouter);
app.get('/graph', function passGraphData( req, res ){
    let graph = {
        nodes: [],
        relations: [],
        // labels:[],
        properties:[],
        filterTags:[],
    }
    graph.nodes = db.getAllNodes().then( ( nodes ) => {
        graph.nodes = nodes;
        db.getAllRelations().then( ( relations ) => {
            graph.relations = relations;
            // db.getAllLabels().then( ( labels ) => {
                // graph.labels = labels;
                db.getAllProperties().then( ( properties ) => {
                    db.getAllPropertyValues(properties).then( ( propertiesAndValues ) => {
                        graph.properties = propertiesAndValues;
                        db.getFilterTags().then( (tags) => {
                            graph.filterTags = tags;
                            res.send(graph);
                        });
                    });
                });
            // });
        });
    });
});
app.get('/organigramm', function passOrganigrammData( req, res){
    let organigramm = {
        nodes: [],
        relations: [],
        // labels:[],
        // properties:[],
        // filterTags:[],
    }
    organigramm.nodes = db.getNodesByLabel("Organigramm").then( ( nodes ) => {
        organigramm.nodes = nodes;
        // console.log( organigramm );
        db.getRelationsByLabel("Organigramm").then( ( relations ) => {
            organigramm.relations = relations;
            res.send( organigramm );
        });
    });
});
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;