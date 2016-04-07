var infrastructure = require("./ipmodule.js");
infrastructure.setTask("bigbaka");
infrastructure.init();
setTimeout(function() {
	if (infrastructure.pools() !== {}) {
		console.log(infrastructure.pools())
		process.exit();
	}
}, 1000);