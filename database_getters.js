var redis = null

module.exports = {
	userFromID: function(sqlAppConnection, userID, cb) {
		sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", userID, function(err, starterUserResults) {
			if (err) throw err;
			if (redis !== null) {
				redis.hkeys("stats-" + userID, function(err, results) {
					//0 = follows | 1 = follower
				    if (results[0][2] !== undefined) {
				    	for (var i = 0; var i < starterUserResults.length - 1; i++) {
				    		starterUserResults[i].stats = {
				    			"following": results[0],
				    			"follower": results[1],
				    			"contributions": results[2]
				    		}
				    	}
				    	cb(starterUserResults, null);
					} else {
						var sql = "SELECT (SELECT count(follows) FROM following WHERE user = ?) AS followings, (SELECT count(user) FROM followings WHERE follows = ?) AS followers, (SELECT count(id) AS contributions FROM posts WHERE by_user = ?) AS contributions";
						sqlAppConnection.query(sql, [userID, userID, userID], function(err, statsResults) {
							if (err) throw err;
							if (statsResults[0] !== undefined) {
								redis.hmset("stats-" + userID, statsResults[0].following, statsResults[0].followers, statsResults[0].contributions);
								redis.expire("stats-" + userID, 30000);
								starterUserResults[0].stats = {
									"following": statsResults[0].following],
									"follower": statsResults[0].followers,
									"contributions": statsResults[0].contributions
								}
								cb(starterUserResults, null)
							}
						})
					}
					
				})
			} else {
				cb(starterUserResults, null);
			}
		});
	},
	setRedis: function(ururedis) {
		redis = ururedis
	}
}