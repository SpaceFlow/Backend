/**
 * Created by Kirschn on 24.05.2016.
 */
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const infrastructure = require("./ipmodule.js");
if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', function (worker, code, signal)  {
        console.log("worker ${worker.process.pid} died");
});
} else {
    console.log("I'm online °O°/");
    infrastructure.setTask("inpost");
    infrastructure.init(function () {
        // Startup successful. Let's start doing our work!
        console.log("Successfully registered");
        
    });
}