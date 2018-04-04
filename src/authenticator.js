var request = require('request-promise');
const constants = require('./constants');

class Authenticator {
  constructor(options) {
    this.deviceName = options.deviceName;
    this.email = options.email;
    this.password = options.password;
    this.log = options.log;

    this.userToken = null;
    this.deviceId = null;
  }

  authenticate(callback) {
    this.log('Logging in...');

    let options = {
      uri: `${constants.API_URI}/${constants.ENDPOINTS['login']}`,
      headers: {
        'User-Agent': constants.USER_AGENT
      },
      method: 'POST',
      json: true,
      body: {
        'email': this.email,
        'password': this.password
      }
    }

    return new Promise((resolve, reject) => {
      request(options).promise().bind(this)
        .then(function(response) {
          if (response.body === undefined) {
            throw new error('Unexpected response');
          }

          this.userToken = response.body.userToken;
          this.log(`Found user token: ${this.userToken}`);

          resolve({
            userToken: this.userToken,
            purifiers: response.body.purifiers
          });
        })
        .catch(function(err) {
          this.log(`Encountered an error when trying to get user token: ${err}`);
          reject(err);
        });
    });
  }
}

module.exports = Authenticator;