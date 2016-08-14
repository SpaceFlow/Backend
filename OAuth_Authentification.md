# OAuth Authentification
In order to communicate with the Spaceflow API, you'll need to authenticate yourself (or your users).
Spaceflow uses the OAuth 2.0 Authentification flow. Once you've created your developer application, you can make these requests to obtiain a OAuth token: 

### Implicid Grand Flow

For client-based authentification


> POST /?app_id=my64characterlongappid&scopes=comma,seperated,list,of,scopes&redirect_uri=http://theuriyousuppliedwhenyoucreatedyourapplication.com&response_type=token

Will return a OAuth Token in the URL Hash if username and password are supplied in the POST body, otherwise it will return a login mask.

### Auth Code Flow

For a server-based authentification

> POST /?app_id=my64characterlongappid&scopes=comma,seperated,list,of,scopes&redirect_uri=http://theuriyousetinyourapplicationconfig.com&response_type=code

Will return a code in the URL Query (?code=64characterlongcode). Now make this request from your private server - the app_secret should never be visible to users.
This request will also return a HTML Login Mask if no or wrong user credentials are supplied.


> POST /token?app_id=my64characterlongappid&app_secret=my64characterlongappsecret&redirect_uri=http://google.com&code=thecodefromthepreviousrequest

If every paramter is set and valid, this ill return a JSON Object with your scopes and the token

> {
>	"scopes": "comma,seperated,list,of,scopes",
>	"token": "my64characterlongaccesstoken"
> }

Spaceflow Developer Addition:

Tokens and their User IDs are stored in the table oauth_tokens.
