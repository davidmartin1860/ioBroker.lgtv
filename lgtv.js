'use strict';
var fs 				= require('fs'); // for storing client key
var utils 			= require(__dirname + '/lib/utils');
var adapter 		= utils.adapter('lgtv');
var LGTV            = require('lgtv2');
var pollTimerChannel       = null;
var pollTimerOnlineStatus       = null;
var pollTimerInput       = null;

function sendCommand(cmd, options, cb) {
	var lgtvobj = new LGTV({
		url: 		'ws://' + adapter.config.ip + ':3000',
		timeout: 	adapter.config.timeout,
		reconnect: 	false
	});
	lgtvobj.on('connecting', function (host)
	{
		adapter.log.debug('Connecting to WebOS TV: ' + host);
	});

	lgtvobj.on('prompt', function ()
	{
		adapter.log.debug('Waiting for pairing confirmation on WebOS TV ' + adapter.config.ip);
	});

	lgtvobj.on('error', function (error)
	{
		adapter.log.debug('Error on connecting or sending command to WebOS TV: ' + error);
		cb && cb(error);
	});

	lgtvobj.on('connect', function (error, response)
	{
		lgtvobj.request(cmd, options, function (_error, response)
		{
			if (_error)
				adapter.log.debug('ERROR! Response from TV: ' + (response ? JSON.stringify(response) : _error));
			lgtvobj.disconnect();
			cb && cb(_error, response);
		});
	});
}

function pollChannel() {
	adapter.log.debug('Polling channel');
	sendCommand('ssap://tv/getCurrentChannel', null, function (err, channel)
	{
		var JSONChannel, ch;
		JSONChannel = JSON.stringify(channel);
		if (JSONChannel) ch = JSONChannel.match(/"channelNumber":"(\d+)"/m);
		if (!err && ch)
		{
			adapter.setState('channel', ch[1], true);
		}
		else
		{
			adapter.setState('channel', '', true);
		}
	});
}

function pollOnlineStatus() {
	adapter.log.debug('Polling OnlineStatus');
	//sendCommand('ssap://audio/getVolume', null, function (err, OnlineStatus)
	sendCommand('com.webos.applicationManager/getForegroundAppInfo', null, function (err, OnlineStatus)
	{
		if (!err && OnlineStatus)
		{
			adapter.setState('on', true, true);
		}
		else
		{
			adapter.setState('on', false, true);
		}
	});
}

function pollInput() {
	adapter.log.debug('Polling Input');
	sendCommand('ssap://com.webos.applicationManager/getForegroundAppInfo', null, function (err, Input)
	{
		if (!err && Input)
		{
			var JSONInput, CurrentInput;
			JSONInput = JSON.stringify(Input);
			if (JSONInput)
			{
				CurrentInput = JSONInput.match(/.*"appId":"(.*?)"/m);
				switch(CurrentInput[1])
				{
					case "com.webos.app.hdmi1":
						adapter.setState('input', 'HDMI_1', true);
					break;

					case "com.webos.app.hdmi2":
						adapter.setState('input', 'HDMI_2', true);
					break;

					case "com.webos.app.hdmi3":
						adapter.setState('input', 'HDMI_3', true);
					break;

					case "com.webos.app.externalinput.scart":
						adapter.setState('input', 'SCART_1', true);
					break;

					case "com.webos.app.externalinput.component":
						adapter.setState('input', 'COMP_1', true);
					break;

					default:
					break;
				}
			}
		}
		else
		{
			adapter.log.debug('ERROR on polling input');
		}
	});
}

function sendButton() {
	lgtv.getSocket(
    'ssap://com.webos.service.networkinput/getPointerInputSocket',
    function(err, sock) {
        if (!err) {
            sock.send('button', {name: "UP"});
        }
    }
	);
}

adapter.on('stateChange', function (id, state)
{
    if (id && state && !state.ack)
	{
		id = id.substring(adapter.namespace.length + 1);
		switch (id)
		{
			case 'popup':
				adapter.log.debug('Sending popup message "' + state.val + '" to WebOS TV: ' + adapter.config.ip);
				sendCommand('ssap://system.notifications/createToast', {message: state.val}, function (err, val) {
					if (!err) adapter.setState('popup', state.val, true);
				});
				break;

			case 'turnOff':
				adapter.log.debug('Sending turn OFF command to WebOS TV: ' + adapter.config.ip);
				/*sendCommand('ssap://system/turnOff', {message: state.val}, function (err, val) {
					if (!err) adapter.setState('turnOff', state.val, true);
				});*/
				sendButton();
				break;

			case 'mute':
				adapter.log.debug('Sending mute ' + state.val + ' command to WebOS TV: ' + adapter.config.ip);
				sendCommand('ssap://audio/setMute', {mute: !!state.val}, function (err, val) {
					if (!err) adapter.setState('mute', !!state.val, true);
				});
				break;

			case 'volumeUp':
				adapter.log.debug('Sending volumeUp ' + state.val + ' command to WebOS TV: ' + adapter.config.ip);
				sendCommand('ssap://audio/volumeUp', null, function (err, val) {
					if (!err) adapter.setState('volumeUp', !!state.val, true);
				});
				break;

			case 'volumeDown':
				adapter.log.debug('Sending volumeDown ' + state.val + ' command to WebOS TV: ' + adapter.config.ip);
				sendCommand('ssap://audio/volumeDown', null, function (err, val) {
					if (!err) adapter.setState('volumeDown', !!state.val, true);
				});
				break;

			case '3Dmode':
				adapter.log.debug('Sending 3Dmode ' + state.val + ' command to WebOS TV: ' + adapter.config.ip);
				switch (state.val)
				{
					case true:
						sendCommand('ssap://com.webos.service.tv.display/set3DOn', null, function (err, val) {
							if (!err) adapter.setState('3Dmode', !!state.val, true);
						});
					break;

					case false:
						sendCommand('ssap://com.webos.service.tv.display/set3DOff', null, function (err, val) {
							if (!err) adapter.setState('3Dmode', !!state.val, true);
						});
					break;
				}
				break;

			case 'launch':
				adapter.log.debug('Sending launch command ' + state.val + ' to WebOS TV: ' + adapter.config.ip);
				switch (state.val)
				{
					case 'livetv':
						adapter.log.debug('Switching to LiveTV on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/launch', {id: "com.webos.app.livetv"}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
					case 'smartshare':
						adapter.log.debug('Switching to SmartShare App on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/launch', {id: "com.webos.app.smartshare"}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
					case 'tvuserguide':
						adapter.log.debug('Switching to TV Userguide App on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/launch', {id: "com.webos.app.tvuserguide"}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
					case 'netflix':
						adapter.log.debug('Switching to Netflix App on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/launch', {id: "netflix"}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
					case 'youtube':
						adapter.log.debug('Switching to Youtube App on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/launch', {id: "youtube.leanback.v4"}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
					case 'prime':
						adapter.log.debug('Switching to Amazon Prime App on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/launch', {id: "lovefilm.de"}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
					case 'amazon':
						adapter.log.debug('Switching to Amazon Prime App on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/launch', {id: "amazon"}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
					default:
						adapter.log.debug(state.val + 'is not a launching app. Opening in Browser on WebOS TV: ' + adapter.config.ip);
						sendCommand('ssap://system.launcher/open', {target: state.val}), function (err, val) {
							if (!err) adapter.setState('launch', state.val, true);
						}
					break;
				}
				break;

			case 'channel':
				adapter.log.debug('Sending switch to channel ' + state.val + ' command to WebOS TV: ' + adapter.config.ip);
				sendCommand('ssap://tv/openChannel', {channelNumber: state.val}, function (err, val) {
					adapter.setState('channel', state.val, true);
				});
				break;

			case 'input':
				adapter.log.debug('Sending switch to input "' + state.val + '" command to WebOS TV: ' + adapter.config.ip);
				sendCommand('ssap://tv/switchInput', {inputId: state.val}, function (err, val) {
					if (!err) adapter.setState('input', state.val, true);
				});

				break;

			default:
				break;
		}
	}
});

adapter.on('ready', main);

function main()
{
	adapter.log.info('Ready. Configured WebOS TV IP: ' + adapter.config.ip);
    adapter.subscribeStates('*');
	if (parseInt(adapter.config.interval, 10)) {
		pollTimerChannel = setInterval(pollChannel, parseInt(adapter.config.interval, 10));
		pollTimerOnlineStatus = setInterval(pollOnlineStatus, parseInt(adapter.config.interval, 10));
		pollTimerInput = setInterval(pollInput, parseInt(adapter.config.interval, 10));
	}
}
