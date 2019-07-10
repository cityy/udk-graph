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
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const session = driver.session();

const db = {
    getAllNodes: function(){
        return new Promise( (resolve, reject) => {
            session.run("MATCH (n) RETURN n").then((resp) => {
                // console.log(resp.records[0]._fields);
                // console.log(resp.records.length);
                session.close();
                driver.close();
                let nodes = [];
                for(let i=0; i< resp.records.length; i++){
                    nodes[i]=resp.records[i]._fields[0];
                }
                resolve(nodes);
            }).catch((err) => {
                reject(err);
            });
        });
    },
    getAllRelations: function(){
        return new Promise( (resolve, reject) => {
            session.run("MATCH (n)-[r]->(m) RETURN r").then((resp) => {
                // console.log(resp.records[0]._fields);
                // console.log(resp.records.length);
                session.close();
                driver.close();
                let relations = [];
                for(let i=0; i< resp.records.length; i++){
                    relations[i]=resp.records[i]._fields[0];
                }
                resolve(relations);
            }).catch((err) => {
                reject(err);
            });
        });
    },
    getNodesByLabel: function(labelName){},
    getRelationsByLabel: function(labelName){},
    getAllLabels: function(){
        return new Promise( (resolve, reject) => {
            session.run("MATCH (n) RETURN distinct labels(n)").then((resp) => {
                // console.log(resp.records[0]._fields);
                session.close();
                driver.close();
                let labels = [];
                for(let i=0; i< resp.records.length; i++){
                    labels[i]=resp.records[i]._fields[0];
                }
                resolve(labels);
            }).catch((err) => {
                reject(err);
            });
        });
    },
}

// db.getAllRelations();
// db.getAllNodes();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.get('/graph', function passGraphData(req, res){
    let graph = {
        nodes: [],
        relations: [],
        labels:[],
    }
    graph.nodes = db.getAllNodes().then((nodes) => {
        graph.nodes = nodes;
        db.getAllRelations().then((relations) => {
            graph.relations = relations;
            db.getAllLabels().then( (labels) => {
                graph.labels = labels;
                res.send(graph);
            });
        });
    })
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
