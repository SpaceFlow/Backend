module.exports = {
	userFromID: function(sqlAppConnection, userID, cb) {
		sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", req.params.user, function(err, starterUserResults) {
			if (err) throw err;
			return starterUserResults;
		});
	}
}