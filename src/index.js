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


//
// 2. the requester object handles server xmlhttp requests
//
const requester = {
    getAll: function(urls){ // urls is an array
        return new Promise( (resolve, reject) => {
            var f = {
                get: function(i){
                    var promise = new Promise( (resolve, reject) => {
                        var req = new XMLHttpRequest();
                        req.open('GET', urls[i]);
                        req.onload = function(){
                            if (req.status === 200) { resolve(req.responseText); }
                            else { console.log('Error' + req.statusText); }
                        }
                        req.send(null);
                    }); // var promise
                    return promise;
                } // get method
            } // obj f
            var promises = []; // array that holds all the request promises 
            for (let i = 0; i < urls.length; i++){ promises.push( f.get(i) ); } // for each requested url, push one response
            Promise.all(promises).then( (dataArr) => { // if all sub promises are done, resolve the getAll promise
                for (let i in dataArr){ dataArr[i] = JSON.parse(dataArr[i]); }
                resolve( dataArr ); 
            });

        } );
    }, // </f: getAll>
    init: () => {
        requester.getAll(['/graph']).then( (resp) => {
            graph.init(resp);
            filter.init(resp[0].labels)
        })
    } // </f: init>
};


//
// 3. the graph object handles webGL graph creation and interaction
//
const graph = {
    obj: undefined,
    hidden:{
        nodes:[],
        links:[], // called relations in neo4J
    },
    options: { /* controlType and renderConfig */ 
        controlType: 'orbit',
    },
    colors: {

    },
    getNodesBy: function(prop, value, includeChildNodes = true){
        let graphData = graph.obj.graphData(); 
        let results = {
            visible:[],
            hidden:[],
        };
        // look in visible nodes
        for(let i=0;i<graphData.nodes.length;i++){
            if(graphData.nodes[i][prop] == value){
                results.visible.push(graphData.nodes[i]);
                // console.log(graphData.nodes[i]);
            }
        }
        // look in hidden nodes
        for(let j=0; j<graph.hidden.nodes.length;j++){
            if(graph.hidden.nodes[j][prop] == value){
                results.hidden.push(graph.hidden.nodes[j]);
            }  
        }

        // console.log(results);
        if(includeChildNodes){
            for(let k=0; k<results.visible.length;k++){
                for(let l=0; l<graphData.links.length;l++){
                    if(graphData.links[l].target === results.visible[k]){
                        results.visible.push(graphData.links[l].source);
                    }
                }
            }
            for(let m=0; m<results.hidden.length;m++){
                for(let n=0; n<graph.hidden.links.length;n++){
                    if(graph.hidden.links[n].target === results.visible[m]){
                        results.visible.push(graphData.links[n].source);
                    }
                }
            }
        }
        return results;
    },
    hideNodes: function(nodes){
        console.log(nodes);
        let newGraphData = graph.obj.graphData();
        for(let i = 0; i < nodes.length; i++){
            // store links that will be hidden (filter returns an array of links for each node to be hidden)
            let linksToHide = newGraphData.links.filter(l => l.source === nodes[i] || l.target === nodes[i]);
            for(let i=0; i<linksToHide.length;i++){
                graph.hidden.links.push(linksToHide[i]);
            }
            // filter links to hide from the graph
            newGraphData.links = newGraphData.links.filter(l => l.source !== nodes[i] && l.target !== nodes[i]); // Remove links attached to node
            // get the index of the current node to hide in the graph data array and remove it
            let index = newGraphData.nodes.indexOf(nodes[i]);
            newGraphData.nodes.splice(index, 1);
            // store the newly hidden node
            graph.hidden.nodes.push(nodes[i]);
            console.log(document.getElementById(nodes[i].label))
            document.getElementById(nodes[i].label).checked = false;
        }
        graph.obj.graphData(newGraphData);  
    },
    showNodes:function(nodes){
        let newGraphData = graph.obj.graphData();
        let restoreLinks = [];
        for(let i = 0; i < nodes.length; i++){
            graph.hidden.nodes.splice( graph.hidden.nodes.indexOf(nodes[i]), 1 );
            newGraphData.nodes.push(nodes[i]);
            let linksToShow = graph.hidden.links.filter(l => { 
                return (l.source === nodes[i] || l.target === nodes[i]) && ( graph.hidden.nodes.indexOf(l.source) === -1 && graph.hidden.nodes.indexOf(l.target) === -1 );
            });
            for(let i=0; i<linksToShow.length;i++){
                graph.hidden.links.splice( graph.hidden.links.indexOf(linksToShow[i]), 1);
                newGraphData.links.push(linksToShow[i]);
            }
        }
        // console.log(graph.hidden);
        graph.obj.graphData(newGraphData);
    },
    init: function(data){
        var black = 'rgba(0,0,0,1)';
        var grey = 'rgba(200,200,200,1)';
        var myData = {
            nodes:[],
            links:[],
        }
        for(let i = 0; i<data[0].nodes.length;i++){
            myData.nodes[i] = {
                id: data[0].nodes[i].identity.low,
                name: data[0].nodes[i].properties.name,
                label: data[0].nodes[i].labels[0],
            };
        } // nodes
        for(let i = 0; i<data[0].relations.length;i++){
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
        let labelCount = data[0].labels.length;
        for(let i = 0; i<data[0].labels.length;i++){
                graph.colors[data[0].labels[i]] = getRandomColor();
        } // labels
        const NODE_REL_SIZE = 4;
        let highlightNodes = [];
        let highlightLinks = [];
        graph.obj = ForceGraph3d(graph.options)(document.getElementById('graph'))
            // general
            .showNavInfo(false)
            .dagMode('bu')
            .dagLevelDistance(100)
            .graphData(myData)
            .backgroundColor('#101020')
            // nodes
            .nodeColor( node => highlightNodes.indexOf(node) === -1 ? graph.colors[node.label] : 'rgba(255,0,0,1)' )
            // links
            .linkWidth(link => highlightLinks.indexOf(link) === -1 ? 1 : 4)
            // particles
            .linkDirectionalParticles(link => highlightLinks.indexOf(link) === -1 ? 2 : 4)
            .linkDirectionalParticleWidth(0.8)
            .linkDirectionalParticleSpeed(0.006)
            .d3Force('collision', d3.forceCollide(node => Math.cbrt(node.size) * NODE_REL_SIZE).radius(10))
            .d3VelocityDecay(0.3)
            // interaction
            .onNodeHover(node => {
                // no state change
                if ((!node && !highlightNodes.length) || (highlightNodes.length === 1 && highlightNodes[0] === node)) return;
                highlightNodes = node ? [node] : [];
                highlightLinks = [];
                let graphData = graph.obj.graphData();
                for(let i=0; i<graphData.links.length; i++){
                    if(graphData.links[i].target === node){
                        highlightLinks.push(graphData.links[i]);
                        highlightNodes.push(graphData.links[i].source);
                    }
                }
                updateGeometries();
            })
            .onLinkHover(link => {
                // no state change
                if ((!link && highlightLinks.length) || (highlightLinks.length === 1 && highlightLinks[0] === link)  ) return;
                  highlightLinks = [];
                  highlightLinks.push(link);
                  highlightNodes = link ? [link.source, link.target] : [];
                updateGeometries();
            });
            function updateGeometries() {
              graph.obj.nodeRelSize(4); // trigger update of 3d objects in scene
            }
    } //</f: init>
};

const filter = {
    checklist: document.getElementById("filterCheckList"),
    allBox: undefined,
    boxes:[],
    status: {
        checked: 0,
        unchecked: 0,
    },
    search:function(text){
        console.log(text);
        for(let i=0;i<filter.boxes.length;i++){
            let id = filter.boxes[i].getAttribute('id').toLowerCase();
            if(id.includes(text) || id.includes(text.toLowerCase())){
                filter.boxes[i].parentElement.style.display="block";
            }
            else{
                filter.boxes[i].parentElement.style.display="none";
            }
        }
    },
    apply: function(targetFilter){ // applies a filter when un/checking a checkbox
                    let filterNodes = graph.getNodesBy("label", targetFilter.getAttribute("id"));
                    if(targetFilter.checked){ 
                        graph.showNodes(filterNodes.hidden)
                        filter.status.checked += 1;
                        filter.status.unchecked -= 1;
                    }
                    else{
                        graph.hideNodes(filterNodes.visible);
                        filter.status.checked -= 1;
                        filter.status.unchecked += 1;
                    }
                    if(filter.status.unchecked === 0){
                        filter.allBox.checked = true;
                        filter.allBox.classList.remove("varies");
                    }
                    else if(filter.status.unchecked < filter.boxes.length){
                        filter.allBox.checked = true;
                        filter.allBox.classList.add("varies");
                    }
                    else if(filter.status.unchecked === filter.boxes.length){
                        filter.allBox.checked = false;
                        filter.allBox.classList.remove("varies");
                    }
    },
    init: function(filters){
        filters =  Array.from(new Set(filters.flat())); // flatten array and remove duplicates, fix this in the server request!
        for(let i=0;i<filters.length;i++){
            // create dom elements for the different labels
            let li = document.createElement("li");
            let input = document.createElement("INPUT");
            input.setAttribute("type", "checkbox");
            input.setAttribute("class", "labelFilter" );
            input.setAttribute("id", filters[i] );
            input.setAttribute("checked", "");
            let span = document.createElement("span");
            span.innerHTML = filters[i];
            // change event listener for checkboxes
            input.addEventListener("change", (e) => {
                    e.stopPropagation();
                    let target = e.target; 
                    filter.apply(target);
            });
            // append new dom elements to tree
            li.appendChild(input);
            li.appendChild(span);
            filter.checklist.appendChild(li);
            // store a list of the filter checkboxes
            filter.boxes.push(input)
        } // </for>
        // set up the checkbox to un/check all filters
        filter.allBox = document.getElementById("allLabels");
        filter.allBox.addEventListener("change", (e) => {
            e.stopPropagation();
            let target = e.target;
            if(target.checked){
                for(let i=0; i<filter.boxes.length; i++){
                    filter.boxes[i].checked = true;
                    filter.boxes[i].dispatchEvent(new Event('change'));
                }
                filter.status.unchecked = 0;
            }
            else{
                for(let i=0; i<filter.boxes.length; i++){
                    filter.boxes[i].checked = false;
                    filter.boxes[i].dispatchEvent(new Event('change'));
                }
                filter.status.unchecked = filter.boxes.length;
            }
            filter.allBox.classList.remove("varies");
        });
        // set up the filter search input
        document.getElementById('filterSearchInput').addEventListener('input', (e) => {
                let text = e.target.value;
                filter.search(text);
            });
    }
}

//
// 4. get kicking 
//
window.onload = () => {
    requester.init();
}