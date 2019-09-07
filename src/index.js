//
// udk-orga - index.js
// handles all the client side javascript
//
// CONTENTS
//
// 1. includes
// 2. requester object
// 3. graph object
// 4. filter object
// 5. window.onload

//
// 1. includes
//
import ForceGraph3d from '3d-force-graph';
require('three');
import SpriteText from 'three-spritetext';
require('./index.scss');
import * as d3 from 'd3-force-3d';
require('d3-dsv');
require('d3-octree');
import 'simplebar';
import 'simplebar/dist/simplebar.css';

( function( ){ // protect global scope

//
// 2. the requester object handles server xmlhttp requests
//
const requester = {
    getAll: function( urls ){ // urls is an array
        return new Promise( ( resolve, reject ) => {
            var f = {
                get: function( i ){
                    var promise = new Promise( ( resolve, reject ) => {
                        var req = new XMLHttpRequest();
                        req.open( 'GET', urls[i] );
                        req.onload = function( ){
                            if ( req.status === 200 ) { resolve( req.responseText ); }
                            else { console.log( 'Error' + req.statusText ); }
                        }
                        req.send( null );
                    }); // var promise
                    return promise;
                } // get method
            } // obj f
            var promises = []; // array that holds all the request promises 
            for ( let i = 0; i < urls.length; i++ ){ promises.push( f.get( i ) ); } // for each requested url, push one response
            Promise.all( promises ).then( ( dataArr ) => { // if all sub promises are done, resolve the getAll promise
                for ( let i in dataArr ){ dataArr[i] = JSON.parse( dataArr[i] ); }
                resolve( dataArr ); 
            });

        } );
    }, // </f: getAll>
    init: ( ) => {
        requester.getAll( ['/graph'] ).then( ( resp ) => {
            graph.init( resp );
            filter.init( resp[0].labels );
            meta.init( resp[0].properties );
            taskbar.init();
        })
    } // </f: init>
};


//
// 3. the graph object handles webGL graph creation and interaction
//
const graph = {
    obj: undefined,
    hidden: {
        nodes: [],
        links: [], // called relations in neo4J
    },
    options: { /* controlType and renderConfig */ 
        controlType: 'orbit',
    },
    colors: {

    },
    getNodesBy: function( prop, value, includeChildNodes = false ){
        let graphData = graph.obj.graphData(); 
        let hiddenGraphData = graph.hidden;
        let results = {
            hits: {
                visible: [],
                hidden: [],
            },
            misses: {
                visible: [],
                hidden: [],
            },
        };

        // look in visible nodes
        for( let i = graphData.nodes.length; i > 0; i-- ){
            if( Array.isArray( graphData.nodes[i-1][prop] ) ){
                let foundSomething = false; 
                for( let j = 0; j < graphData.nodes[i-1][prop].length; j++ ){
                    if( graphData.nodes[i-1][prop][j] === value ){
                        results.hits.visible.push( graphData.nodes[i-1] );
                        foundSomething = true;
                    }  
                }
                if( !foundSomething ){
                    results.misses.visible.push( graphData.nodes[i-1] );
                }
            }
            else{
                if( graphData.nodes[i-1][prop] === value ){
                    results.hits.visible.push( graphData.nodes[i-1] );
                }
                else{
                    results.misses.visible.push( graphData.nodes[i-1] );
                }
            }
        }

        // look in hidden nodes
        for( let k = hiddenGraphData.nodes.length; k > 0; k-- ) {
            if( Array.isArray( hiddenGraphData.nodes[k-1][prop] ) ){
                let foundSomething = false;
                for( let j = 0; j < hiddenGraphData.nodes[k-1][prop].length; j++ ){
                    if( hiddenGraphData.nodes[k-1][prop] === value ) {
                      results.hits.hidden.push( hiddenGraphData.nodes[k-1] );
                      foundSomething = true;
                    }
                }
                if( !foundSomething ) {
                    results.misses.hidden.push( hiddenGraphData.nodes[k-1] );
                }  
            }
            else{
                if( hiddenGraphData.nodes[k-1][prop] === value ){
                    results.hits.hidden.push( hiddenGraphData.nodes[k-1] );
                }
                else{
                    results.misses.hidden.push( hiddenGraphData.nodes[k-1] );
                }     
            }
        }

        // if(includeChildNodes){
        //     for(let k=0; k<results.visible.length;k++){
        //         for(let l=0; l<graphData.links.length;l++){
        //             if(graphData.links[l].target === results.visible[k]){
        //                 results.visible.push(graphData.links[l].source);
        //             }
        //         }
        //     }
        //     for(let m=0; m<results.hidden.length;m++){
        //         for(let n=0; n<graph.hidden.links.length;n++){
        //             if(graph.hidden.links[n].target === results.visible[m]){
        //                 results.visible.push(graphData.links[n].source);
        //             }
        //         }
        //     }
        // }
        return results;
    },
    // broken stuff here
    // sophia prinz disappears? highest id
    hideNodes: function( nodes ) {
        let newGraphData = graph.obj.graphData();

        if( nodes === "all" ){
            graph.hidden.nodes = newGraphData.nodes;
            graph.hidden.links = newGraphData.links;
            newGraphData.nodes = [];
            newGraphData.links = [];
        }
        else{
            for(let i = 0; i < nodes.length; i++){
                // store links that will be hidden (filter returns an array of links for each node to be hidden)
                function isConnected( l ) {  return l.source === nodes[i] || l.target === nodes[i]; }

                let linksToHide = newGraphData.links.filter( isConnected ); // this sometimes doesnt catch source relevant nodes
                for( let j = 0; j < linksToHide.length; j++ ){
                    graph.hidden.links.push( linksToHide[j] );
                    newGraphData.links.splice( newGraphData.links.indexOf( linksToHide[j] ), 1);
                }
                // get the index of the current node to hide in the graph data array and remove it
                let index = newGraphData.nodes.indexOf(nodes[i]);
                newGraphData.nodes.splice(index, 1);
                // store the newly hidden node
                graph.hidden.nodes.push(nodes[i]);
            }
        }
        graph.obj.graphData( newGraphData );  
    },
    showNodes: function( nodes ) {
        let newGraphData = graph.obj.graphData();
        let restoreLinks = [];

        if( nodes === "all" ) { // if "all" arg is handed, restore all nodes (and links), need this e.g. if all links are hidden but some nodes are visible, i.e. when disabling a meta filter

            newGraphData.nodes.push( ...graph.hidden.nodes );
            newGraphData.links.push( ...graph.hidden.links );

            graph.hidden.nodes = [];
            graph.hidden.links = [];

        }
        else { // if an array of nodes is handed...

            for( let i = nodes.length - 1; i >= 0; i-- ) {

                graph.hidden.nodes.splice( graph.hidden.nodes.indexOf( nodes[i] ), 1 );
                newGraphData.nodes.push( nodes[i] );
                let linksToShow = graph.hidden.links.filter( l => { 
                    return ( l.source === nodes[i] || l.target === nodes[i] ) && ( graph.hidden.nodes.indexOf( l.source ) === -1 && graph.hidden.nodes.indexOf( l.target ) === -1 );
                } );
                

                for( let j = 0; j < linksToShow.length; j++ ){
            
                    graph.hidden.links.splice( graph.hidden.links.indexOf( linksToShow[j] ), 1 );
                    newGraphData.links.push( linksToShow[j] );
            
                } // for
            
            } // for

        } // else
        graph.obj.graphData( newGraphData );
    },
    init: function( data ){
        var black = 'rgba(0,0,0,1)';
        var grey = 'rgba(200,200,200,1)';
        var myData = {
            nodes:[],
            links:[],
        }
        for( let i = 0; i < data[0].nodes.length; i++ ){
            myData.nodes[i] = data[0].nodes[i].properties;
            myData.nodes[i].id = data[0].nodes[i].identity.low; //ids corresponding to the database
            myData.nodes[i].label = data[0].nodes[i].labels[0];
        } // nodes
        for( let i = 0; i < data[0].relations.length; i++ ){
            myData.links[i] = {
                id: data[0].relations[i].identity.low,
                source: data[0].relations[i].start.low,
                target: data[0].relations[i].end.low,
                type: data[0].relations[i].type,
            };
        } // links


        function getRandomColor() {
          var letters = '0123456789ABCDEF';
          var color = '#';
          for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
          }
          return color;
        }
        for(let i = 0; i<data[0].labels.tags.length;i++){
                graph.colors[data[0].labels.tags[i]] = getRandomColor();
        } // labels
        const NODE_REL_SIZE = 4;
        let highlightNodes = [];
        let highlightLinks = [];
        graph.obj = ForceGraph3d( graph.options )( document.getElementById('graph') )
            // general
            .showNavInfo( false )
            .dagMode( 'bu' )
            .dagLevelDistance( 100 )
            .graphData( myData )
            .backgroundColor( '#FFFFFF' )
            // nodes
            .nodeColor( node => highlightNodes.indexOf( node ) === -1 ? graph.colors[node.label] : 'rgba(255,0,0,1)' )
            // links
            .linkWidth( link => highlightLinks.indexOf( link ) === -1 ? 1 : 4)
            // particles
            .linkDirectionalParticles( link => highlightLinks.indexOf( link ) === -1 ? 2 : 4)
            .linkDirectionalParticleWidth( 0.8 )
            .linkDirectionalParticleSpeed( 0.006 )
            .d3Force('collision', d3.forceCollide( node => Math.cbrt( node.size ) * NODE_REL_SIZE).radius( 10 ) )
            .d3VelocityDecay( 0.3 )
            // interaction
            .onNodeClick( node => {
                // no state change
                if ( ( !node && !highlightNodes.length ) ||  (highlightNodes.length === 1 && highlightNodes[0] === node ) ) {
                    return;
                }
                // state change
                else if( node && highlightNodes[0] != node ){
                    // update the node info container
                    highlightNodes = node ? [node] : [];
                    highlightLinks = [];
                    let members = [];
                    let parents = [];
                    let graphData = graph.obj.graphData();
                    for( let i=0; i<graphData.links.length; i++ ){
                        if( graphData.links[i].target === node ){
                            highlightLinks.push( graphData.links[i] );
                            highlightNodes.push( graphData.links[i].source );
                            // collect the members for the node info container
                            members.push( { name: graphData.links[i].source.name, label: graphData.links[i].source.label, link: graphData.links[i].type } )
                        }
                        // collect node parents
                        if( graphData.links[i].source === node ){
                            parents.push( { name: graphData.links[i].target.name, label: graphData.links[i].source.label, link: graphData.links[i].type } )
                        }
                    }
                    info.init( node, members, parents );
                    updateGeometries();
                }
            })
            .onLinkHover( link => {
                // no state change
                if ( ( !link && highlightLinks.length ) || ( highlightLinks.length === 1 && highlightLinks[0] === link ) ) return;
                  highlightLinks = [];
                  highlightLinks.push(link);
                  highlightNodes = link ? [link.source, link.target] : [];
                updateGeometries();
            });
            function updateGeometries() {
              graph.obj.nodeRelSize( 4 ); // trigger update of 3d objects in scene
            }
    } //</f: init>
};

// the object that handles the filters
const filter = {
    window: undefined,
    checklist: undefined,
    allBox: undefined,
    boxes:[],
    status: {
        checked: 0,
        unchecked: 0,
    },
    search: function( text ) {
        for( let i = 0; i < filter.boxes.length; i++ ){
            let id = filter.boxes[i].getAttribute( 'id' ).toLowerCase();
            if( id.includes( text ) || id.includes( text.toLowerCase() ) ) {
                filter.boxes[i].parentElement.style.display = "block";
            }
            else {
                filter.boxes[i].parentElement.style.display = "none";
            }
        }
    },
    apply: function( targetFilter ) { // applies a filter when un/checking a checkbox
                    let filterNodes = graph.getNodesBy( "label", targetFilter.getAttribute( "id" ) );
                    // hide or show nodes according to filter
                    if( targetFilter.checked ){ 
                        graph.showNodes( filterNodes.hits.hidden )
                        filter.status.unchecked -= 1;
                    }
                    else{
                        graph.hideNodes( filterNodes.hits.visible );
                        filter.status.unchecked += 1;
                    }
                    // take care of the "all" checkbox
                    if( filter.status.unchecked === 0 ){
                        filter.allBox.checked = true;
                        filter.allBox.classList.remove( "varies" );
                    }
                    else if( filter.status.unchecked < filter.boxes.length ){
                        filter.allBox.checked = true;
                        filter.allBox.classList.add( "varies" );
                    }
                    else if( filter.status.unchecked === filter.boxes.length ){
                        filter.allBox.checked = false;
                        filter.allBox.classList.remove( "varies" );
                    }
    },
    enableAll: function( ) { // re-enable all filters for a uniform state
        filter.allBox.checked = true;
        filter.allBox.classList.remove( "varies" );
        for( let i = 0; i < filter.boxes.length; i++ ){
            filter.boxes[i].checked = true;
        }
    },
    disableAll: function( ) {
        filter.allBox.checked = false;
        filter.allBox.classList.remove( "varies" );
        for( let i = 0; i < filter.boxes.length; i++ ){
            filter.boxes[i].checked = false;
        }
    },
    init: function( filters ) {
        // create the filter window
        filter.window = new uiWindow( "filter", true );

        let filterSearchInput = document.createElement( 'input' );
        filterSearchInput.setAttribute( "type", "search" );
        filterSearchInput.setAttribute( "id", "filterSearchInput" );
        filterSearchInput.setAttribute( "placeholder", "Search filter/meta tags" );
        
        filter.checklist = document.createElement( 'ul' );
        filter.checklist.setAttribute( "id", "filterCheckList" );

        let allLabelsLi = document.createElement( 'li' );

        let allLabelsChecker = document.createElement( 'input' );
        allLabelsChecker.setAttribute( 'id', "allLabels" );
        allLabelsChecker.classList.add( 'labelFilter' );
        allLabelsChecker.setAttribute( 'type', 'checkbox' );
        allLabelsChecker.setAttribute( 'checked', '');

        let allLabelsSpan = document.createElement( 'span' );
        allLabelsSpan.innerHTML = 'All';

        allLabelsLi.appendChild( allLabelsChecker );
        allLabelsLi.appendChild( allLabelsSpan );
        filter.checklist.appendChild( allLabelsLi );

        filter.window.content.appendChild( filterSearchInput );
        filter.window.content.appendChild( filter.checklist );

        // list all filters
        for( let i = 0; i < filters.tags.length; i++ ) {
            // create dom elements for the different labels
            let li = document.createElement( "li" );
            let input = document.createElement( "INPUT" );
            input.setAttribute( "type", "checkbox" );
            input.setAttribute( "class", "labelFilter" );
            input.setAttribute( "id", filters.tags[i] );
            input.setAttribute( "checked" , "");
            let span = document.createElement( "span" );
            span.innerHTML = filters.tags[i] + '<sup> [' + filters.counts[i] + ']</sup>';
            // change event listener for checkboxes
            input.addEventListener( "change", ( e ) => {
                    e.stopPropagation();
                    let target = e.target; 
                    filter.apply( target );
            });
            // append new dom elements to tree
            li.appendChild( input );
            li.appendChild( span );
            filter.checklist.appendChild( li );
            // store a list of the filter checkboxes
            filter.boxes.push( input )
        } // </for>

        // set up the checkbox to un/check all filters
        filter.allBox = document.getElementById( "allLabels" );
        filter.allBox.addEventListener( "change", ( e ) => {
            e.stopPropagation();
            let target = e.target;
            if( target.checked ){
                for( let i = 0; i < filter.boxes.length; i++ ){
                    filter.boxes[i].checked = true;
                }
                graph.showNodes( "all" );
                filter.status.unchecked = 0;
            }
            else{
                for( let i = 0; i < filter.boxes.length; i++ ){
                    filter.boxes[i].checked = false;
                    filter.boxes[i].dispatchEvent( new Event( 'change' ));
                }
                filter.status.unchecked = filter.boxes.length;
            }
            filter.allBox.classList.remove( "varies" );
        });
        // set up the filter search input
        document.getElementById( 'filterSearchInput' ).addEventListener( 'input', ( e ) => {
                let text = e.target.value;
                filter.search( text );
            });
    }
}



const meta = {
    // note: meta nodes use negative ids starting from -1
    // note: only one meta filter can be active
    // consider: displaying meta filters in a separate window
    isActive: false,
    checklist: undefined,
    // meta.boxes stores the meta input checkboxes
    boxes:[],
    // meta.nodes and meta.links store the temporary property and value nodes and their links
    nodes:[],
    links:[],
    
    disable: function(){ // function to disable any currently active meta
        meta.isActive = false; 
        // destroy all meta nodes and links and display the original graph
        let { nodes, links } = graph.obj.graphData();

        for( let i = 0; i < meta.links.length; i++ ){
            links.splice( links.indexOf( meta.links[i] ) , 1)
        }

        for( let j = 0; j < meta.nodes.length; j++ ){
            nodes.splice( nodes.indexOf( meta.nodes[j] ) , 1)
        }

        meta.nodes = [];
        meta.links = [];

        graph.showNodes( "all" );
        graph.obj.graphData( { nodes, links } );

        filter.disableAll();
        filter.enableAll();        
    },
    apply: function( targetMeta ){
        console.log( graph.obj.graphData().nodes );
        // apply() is run when a meta checkbox is toggled
        filter.enableAll(); // reenable all filters first for a uniform state, this behaviour can be discussed
        let metaProperty = targetMeta.getAttribute( "id" );
        let metaValues = targetMeta.getAttribute( "val" ).split( "," );
        let metaNodes = {};

        if( meta.isActive ){ meta.disable(); }

        if( targetMeta.checked ){
            meta.isActive = true;
            let propNode = { id: -1, name: metaProperty, label: "Meta-Property" };  // the node that resembles the meta property
            let valueNodes = []; // the nodes that resemble the meta property values
            let propValueLinks = []; // the links from property to values
            let nodeLinks = []; // the links from nodes to values
            let hits = [];
            let misses = [];

            // uncheck any other active meta box
            for( let j = 0; j < meta.boxes.length; j++ ){
                if( meta.boxes[j] != targetMeta ){
                    meta.boxes[j].checked = false;
                }
            }

            // create value nodes and retrive the nodes matching the meta property from the graph
            for( let i = 0; i < metaValues.length; i++ ){

                // create one new node for each property value
                valueNodes.push( { id: i*-1-2, name: metaValues[i], label: "Meta-Property-Value" } );
                // link property values nodes to the property node
                propValueLinks.push( { source: valueNodes[i], target: propNode, label: "Value of Property" } );
                // get the nodes corresponding to the meta filter
                metaNodes[ metaValues[i] ] = graph.getNodesBy( metaProperty , metaValues[i] );
                // hide nodes that don't have the meta property and show those which do have it
                hits.push( ...metaNodes[ metaValues[i] ].hits.visible );
                misses.push( ...metaNodes[ metaValues[i] ].misses.visible );

            }   

            // remove duplicates from hits and misses
            misses = Array.from( new Set( misses ) );
            hits = Array.from( new Set( hits ) );
            // hide and show the corresponding nodes for the meta property
            graph.hideNodes( misses );
            graph.showNodes( hits );
            

            // create the links from nodes to values
            let { nodes, links } = graph.obj.graphData();
            for(let j = 0; j < nodes.length; j++ ){
            
                for( let k = 0; k < valueNodes.length; k++ ){
                    if( Array.isArray(nodes[j][metaProperty]) ) {
                        for( let l = 0; l < nodes[j][metaProperty].length; l++ ) {
                            if( valueNodes[k].name === nodes[j][metaProperty][l] ){
                                nodeLinks.push( { source: nodes[j], target: valueNodes[k], label: "Has Property Value", } );
                            }
                        }
                    }
                    else{
                        if( valueNodes[k].name === nodes[j][metaProperty] ){
                            nodeLinks.push( { source: nodes[j], target: valueNodes[k], label: "Has Property Value", } );
                        }
                    }
                
                }
            
            } // for

            // store the newly created nodes and links to be able to easily destroy them
            meta.nodes.push( propNode, ...valueNodes );
            meta.links.push( ...propValueLinks, ...nodeLinks );
            // update the graph
            graph.obj.graphData( {
                nodes: [ ...nodes, propNode, ...valueNodes ],
                links: [ ...links, ...propValueLinks, ...nodeLinks ]
            } ); 
        } // if targetMeta.checked
    },
    init: function( properties ){
        // create dom structure
        meta.checklist = document.createElement( 'ul' )
        filter.window.content.appendChild( document.createElement( 'hr' ) );
        filter.window.content.appendChild( meta.checklist );
        // list meta tags
        for( let j = 0; j < properties.length; j++ ){
                // create dom elements for the different labels
                let li = document.createElement( "li" );
                let input = document.createElement( "INPUT" );
                input.setAttribute( "type", "checkbox" );
                input.setAttribute( "class", "metaFilter" );
                input.setAttribute( "id", properties[j].prop );
                input.setAttribute( "val", properties[j].values );
                let span = document.createElement( "span" );
                span.innerHTML = properties[j].prop;
                // change event listener for checkboxes
                input.addEventListener( "change", ( e ) => {
                        e.stopPropagation();
                        let target = e.target; 
                        meta.apply( target );
                } );
                // append new dom elements to tree
                li.appendChild( input );
                li.appendChild( span );
                meta.checklist.appendChild( li );
                // store a list of the filter checkboxes
                meta.boxes.push( input )
            }
        }
}

// the object that handles the node info container
const info = {
    windows: [],
    // container: document.getElementById('nodeInfoContainer'),
    // name: document.getElementById('nodeName'),
    // labels: document.getElementById('nodeLabels'),
    // propList: document.getElementById('nodePropList'),
    // memberList: document.getElementById('nodeMemberList'),
    // parentList: document.getElementById('nodeParentList'),
    // update: function(node, members, parents){
    //     if(members.length){
    //         for(let i = 0; i<members.length; i++) {
    //             let member = document.createElement('li');
    //             member.innerHTML = members[i].name + '<br /><span>' + members[i].label + ', ' + members[i].link + '</span>';
    //             info.memberList.appendChild(member);
    //         }
    //     }
    //     else{ info.memberList.innerHTML = '<li>-</li>' }
    //     // push parents to the parentslist
    //     if(parents.length){    
    //         for(let j=0; j<parents.length; j++){
    //             let parent = document.createElement('li');
    //             parent.innerHTML = parents[j].name + '<br /><span>' + parents[j].label + ', ' + parents[j].link + '</span>';
    //             info.parentList.appendChild(parent);
    //         }
    //     }
    //     else{ info.parentList.innerHTML = '<li>-</li>' }
    // },
    init: function( node, members, parents ){
        let newInfoWindow = new uiWindow( "info" );
        newInfoWindow.changeTitle( node.name );
        info.windows.push( newInfoWindow );

        // PROPERTIES
        let nodePropList = document.createElement( "ul" );
        nodePropList.setAttribute( "id", "nodePropList" );

        function addSeperator( ){
            let seperator = document.createElement( 'span' );
            seperator.innerHTML = " // ";
            return seperator;
        }
        // add support for multiple labels in the future
        let label = document.createElement( 'li' );
        label.innerHTML = node.label;
        nodePropList.appendChild( label );

        if( Object.keys( node ).length > 1 ){
            for( let prop in node ){
                if ( node.hasOwnProperty( prop ) && prop != "name" ) {
                    let property = document.createElement('li');
                    property.innerHTML = prop + ": " + node[prop];
                    nodePropList.appendChild( addSeperator() );
                    nodePropList.appendChild( property );
                }
            }
        }
        else{ 
            nodePropList.appendChild( addSeperator() );
            nodePropList.innerHTML = '<li>No properties available.</li>' 
            }
        // MEMBERS
        let nodeMemberHeading = document.createElement( 'h4' );
        nodeMemberHeading.innerHTML = "Members [" + members.length  + "]";
        let nodeMemberList = document.createElement( "ul" );
        nodeMemberList.setAttribute( "id", "nodeMemberList" );

        if(members.length){
            for( let i = 0; i < members.length; i++ ) {
                    let member = document.createElement( 'li' );
                    member.innerHTML = members[i].name + '<br /><span>' + members[i].label + ', ' + members[i].link + '</span>';
                    // nodePropList.appendChild(addSeperator());
                    nodeMemberList.appendChild( member );
            }
        }
        else{ 
            nodeMemberList.innerHTML = '<li>No Members available.</li>' 
            }
        // PARENTS
        let nodeParentsHeading = document.createElement( 'h4' );
        nodeParentsHeading.innerHTML = "Parents [" + parents.length  + "]";
        let nodeParentList = document.createElement( "ul" );
        nodeParentList.setAttribute( "id", "nodeParentList" );

        if(parents.length){
            for( let i = 0; i < parents.length; i++ ) {
                    let member = document.createElement( 'li' );
                    member.innerHTML = parents[i].name + '<br /><span>' + parents[i].label + ', ' + parents[i].link + '</span>';
                    nodeParentList.appendChild(member);
            }
        }
        else{ 
            nodeParentList.innerHTML = '<li>No Members available.</li>' 
            }

        newInfoWindow.content.appendChild( nodePropList );
        newInfoWindow.content.appendChild( nodeParentsHeading );
        newInfoWindow.content.appendChild( nodeParentList );
        newInfoWindow.content.appendChild( nodeMemberHeading );
        newInfoWindow.content.appendChild( nodeMemberList );
    },
}
//
// taskbar
//
const taskbar = {
    start: document.getElementById("start"),
    startMenu: document.getElementById("startMenu"),
    toggleStartMenu: function(){
        if(taskbar.startMenu.style.display === "none" || taskbar.startMenu.style.display === ""){
            taskbar.startMenu.style.display = "block";
        }
        else if(taskbar.startMenu.style.display === "block"){
            taskbar.startMenu.style.display = "none";
        }
    },
    init: function(){
        taskbar.start.addEventListener('click', () => {
            taskbar.toggleStartMenu();
        });
        document.getElementById('filterShortcut').addEventListener('click', (e) => {
            e.preventDefault();
            filter.window.open();
            taskbar.toggleStartMenu();
        });
    }
}
// //
// // window management
// //
const uiWindow = function( name, permanent ){
    // props
    this.name = undefined;
    this.domELM = undefined;
    this.content = undefined;
    this.permanence = permanent;
    let middleCol = undefined;
    // private methods
    let makeDragable = function(elm, handle){
        function dragElement(elmnt) {
            var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            handle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                e.preventDefault();
                // get the mouse cursor position at startup:
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                // call a function whenever the cursor moves:
                document.onmousemove = elementDrag;
            } //dragMouseDown

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                // calculate the new cursor position:
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                // set the element's new position:
                elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
                elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
            } // elementDrag

            function closeDragElement() {
                // stop moving when mouse button is released:
                document.onmouseup = null;
                document.onmousemove = null;
            } // closeDragElement
        } // dragElement
        dragElement(elm);
    }
    let close = function(instance){
        if(instance.permanence){
            instance.domElm.style.display = 'none';
        }
        else{
            instance.domElm.remove();
        }
    }
    let init = function(instance){
        // build the window dom structure 
        instance.name = name;
        instance.domElm = document.createElement("div");
        instance.domElm.setAttribute("id", name.toLowerCase() + "Window");
        instance.domElm.classList.add("window");
        // create titleBar
        let titleBar = document.createElement('div');
        titleBar.classList.add("titleBar");
        let leftCol = document.createElement('div');
        middleCol = document.createElement('div');
        let rightCol = document.createElement('div');
        leftCol.classList.add('leftCol');
        middleCol.classList.add('middleCol');
        rightCol.classList.add('rightCol');
        middleCol.innerHTML = name;
        let closeLink = document.createElement('a');
        closeLink.setAttribute('href','#');
        closeLink.classList.add('cleanLink');
        closeLink.addEventListener('click', ()=>{ close(instance) } );
        closeLink.innerHTML = 'x';

        let contentWrapper = document.createElement('div');
        contentWrapper.classList.add('scrollWrapper');
        contentWrapper.setAttribute('data-simplebar', "");

        instance.content = document.createElement('div');
        instance.content.classList.add('windowContent')

        rightCol.appendChild(closeLink);

        titleBar.appendChild(leftCol);
        titleBar.appendChild(middleCol);
        titleBar.appendChild(rightCol);

        instance.domElm.appendChild(titleBar);
        contentWrapper.appendChild(instance.content);
        instance.domElm.appendChild(contentWrapper);

        makeDragable(instance.domElm, titleBar);
        document.body.appendChild(instance.domElm);
    }
    init(this);
    // public methods
    return {
        domElm: this.domElm,
        content: this.content,
        permanence: this.permanence,
        changeTitle: function(newTitle){
            middleCol.innerHTML = newTitle;
        },
        open: function(){
            // console.log(this);
            if(this.permanence){
                this.domElm.style.display = "block";
            }
            else{
                document.body.appendChild(this.domElm);
            }
        },
    } // return public methods
    // init
};
//
// 4. get kicking 
//
window.onload = () => {
    requester.init();
}

})(); // protect global scope