var
  _ = require('underscore'),
  conf = process.env.NODE_ENV === 'production' ? {} : require('../config'),
  express = require('express'),
  mongoose = require('mongoose'),
  request = require('request');

mongoose.connect(conf.database);

var Receiver = mongoose.model('Receiver', { 
  token: String, // the slash command token to verify this broadcast came from a slack team... we could actually open this up and not need it in the future
  webhook: String // the url to send word to 
});

var Message = mongoose.model('Message', {
  text: String,
  userid: String,
  username: String,
  teamid: String,
  teamname: String,
  time: Date
});
  
function saveRecordOfMessage(message) {
  var m = new Message({
    text: message.text,
    userid: message.user_id,
    username: message.user_name,
    teamid: message.team_id,
    teamname: message.team_domain,
    time: Date.now()
  });
  m.save(function (err) {
    if (err) console.log('there was an error saving a message: ', JSON.stringify(message));
  });
}

function sendMessagesToReceivers(receivers, message) {
     var
       text = message.user_name + ' from ' + message.team_domain + ' says: ' + message.text,
       payload = { text: text, parse: 'full' };   
   
   receivers.forEach(function (r) {
     if (message.token !== r.token) { // don't send it back to the senders own slack team
       var
         opts = {
           url: r.webhook,
           form: JSON.stringify(payload)
         };
      request.post(opts, function (err, body, response) {
        if (err) console.log('there was an error posting to webhook:' + r.webhook);
      });
    }
  });
}

module.exports = {
  start: function () {
    var
      app = express(),
      port = process.env.PORT ? process.env.PORT : 4400,
      bodyParser = require('body-parser');

    app.use(bodyParser.json()); // for parsing application/json
    app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
    app.use(express.static('public'));
    app.set('view engine', 'jade');
    app.listen(port);

    app.post('/message', function (req, res) {
      Receiver.find({}, function (err, receivers) {
        if (err || !_.find(receivers, function (r) { return req.body.token === r.token })) {
          console.log(err || 'an unauthorized attempt to post a message was made');
          return res.sendStatus(500);
        }
        sendMessagesToReceivers(receivers, req.body);
        saveRecordOfMessage(req.body);
        res.sendStatus(200);
      });
    });

    app.post('/subscribe', function (req, res) {
      if (!req.body.token || !req.body.webhook) {
        return res.redirect('/?message=failure');
      }
      var receiver = new Receiver({
        token: req.body.token,
        webhook: req.body.webhook
      });
      receiver.save(function (err) {
        if (err) {
          console.log('there was an error saving a webhook');
          return res.redirect('/?message=failure');
        }
        return res.redirect('/?message=success');
      });
    });

    app.get('/', function (req, res) {
      var
        status;

      if (req.query.message === 'success') status = 'good';
      else if (req.query.message === 'failure') status = 'bad';
      res.render('subscribe', {
        status: status
      });
    });

    console.log('Up and running on port', port);
  }
};
