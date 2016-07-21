// Client Module to connect to the Round Robin Server
// Author: Kirschn
var loadserveradress = "http://192.168.178.128:8081";
// CODE:
var ioclient = require("socket.io-client")(loadserveradress),
    request = require("request"),
    util = require("util"),
    fs = require("fs"),
    poolcache = {};
var http = require('http');
var express = require('express');
Array.prototype.unset = function(value) {
    if(this.indexOf(value) != -1) { // Make sure the value exists
        this.splice(this.indexOf(value), 1);
    }   
};
var mytask = null,
    myid = NaN;
var pools = {};
try {
    fs.accessSync(__dirname + "/poolcache.json", fs.F_OK);
    pools = JSON.parse(fs.readFileSync("./poolcache.json"))
} catch (e) {
    fs.writeFileSync("./poolcache.json", JSON.stringify(pools));
}
var streamfunctions = {

};
module.exports = {
	getAdress: function(pool) {
        // get random address from pool
		if (pools[pool] == undefined) {
			return null;
		} else {
			return pools[pool][Math.floor(Math.random()*pools[pool].length)]
		}
	},

	pools: function() {
		// Gibt Array mit allen aktiven IPs zurück
		// Client kann daraus nen runden Robin bauen
		return pools;
	},

	setTask: function(taskname) {
		// Muss vor Initierung aufgerufen werden
		// Setzt Rolle des Client
		if (taskname !== undefined) {
			return (mytask = taskname);
		}
	},
	streamRegister: function (id, func) {
        // registers new stream function
        // whenever /input/:id: is called
        // func will be triggered with the POST body as parameter
		streamfunctions[id] = func;
		return true;
	},
	init: function(cb) {
        // init this module!
        // note: task has to be set before init
        // if not, the node will be assigned to the "undefined" pool
		if (mytask == null) {
			util.log("Note: Registering with undefined task")
		}
        // start local webserver
		var app = express();
		var server = http.createServer(app).listen();
		app.set('port', server.address().port);
		util.log("Trying to register...");
		util.log("Client Config: Port " + app.get('port'));
		ioclient.emit("register", JSON.stringify({
		    port: app.get('port'),
		    job: mytask
		}));
		var pinging = true;
        // start pinging the index server
		setInterval(function() {
		    
		    if (pinging) {
		    ioclient.send(JSON.stringify({
		        load: null,
		        type: "ping"
		    }));
		        
		    }
		}, 1000);
		util.log("Connected!");
        // le ping function
        // loadbalancer can control this node
		ioclient.on("message", function(data) {
		    var parseddata = JSON.parse(data);
		    console.log(parseddata);
		    if (parseddata.type == "fuckyou") {
		        // Ping abgewiesen, Skript wahrscheinlich korrupt!
		        console.log(parseddata);
		        util.log("FeelsBadMan");
		        process.exit(1);
		    }

		});
		ioclient.on("task", function(data) {
            // init this shit
            // got task!
		    var parsedtask = JSON.parse(data);
		    mytask = parsedtask.job;
		    myid = parsedtask.id;
		    util.log("I AM " + myid + ". MY TASK IS " + mytask);
		    module.exports.getPools(function() {
		        // Fertig initialisiert!
		        util.log("Done!");
				cb();
		        ioclient.on("poolupdate", function(data) {
		            pools = JSON.parse(data);
		            fs.writeFileSync("./poolcache.json", JSON.stringify(pools));
		            util.log("Parsed new Pool JSON");
		        })
		        
		        
		        
		        
		    })
		});
		app.get('/', function(req, res) {
            // every node can dump a load!
		    res.end(JSON.stringify(pools));
		    
		});
		app.post("/input/:stream", function(req, res) {
            // inbound POST stream
            // functions and events can be set above
			if (streamfunctions[req.params.stream] !== undefined) {
				streamfunctions[req.params.stream](req.body);
				res.end("ok");
			} else {
				res.end("500 does not exist");
			}
		});
        // debug dis shit
		process.stdin.setEncoding('utf8');
		process.stdin.on('readable', function() {
		    var chunk = process.stdin.read();
		if (chunk !== null) {
		    eval(chunk)
		}
		});
	},
	getPools: function getPools(callback) {
        // get pools from loadserver and cache to local poolcache.json
    request(loadserveradress, function (error, response, body) {
  		if (!error && response.statusCode == 200) {
    	console.log("Pool request successfull: " + body);
    	pools = JSON.parse(body);
    	fs.writeFileSync("./poolcache.json", JSON.stringify(pools));
    	callback();
    }
})
}
};
