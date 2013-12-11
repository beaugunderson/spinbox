var oboe = require('oboe');
var moment = require('moment');
var mousetrap = require('mousetrap', ['Mousetrap']);
var $ = require('jquery');
var _ = require('lodash');

var rowTemplate;

function getMail() {
  var messages = [];

  oboe('/mail')
    .node('statistics', function (statistics) {
      console.log('Got statistics', statistics);
    })
    .node('messages.*', function (message) {
      console.log('Got message', message.attributes['x-gm-msgid']);

      messages.push(message);

      $('#messages').append(rowTemplate({
        from: (message.body.from[0].name || message.body.from[0].address),
        subject: message.body.subject,
        date: moment(message.attributes.date).fromNow(true),
        body: message.body.inlineHtml || message.body.text
      }));
    })
    .done(function () {
      console.log('Done', messages.length);
    });
}

$(function () {
  rowTemplate = _.template($('#message-row').html());

  getMail();
});
