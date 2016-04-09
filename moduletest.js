var infrastructure = require("./ipmodule.js");
infrastructure.setTask("bigbaka");
infrastructure.init();
setTimeout(function() {
		var webserveradress = infrastructure.getAdress("webserver")
}, 1000);