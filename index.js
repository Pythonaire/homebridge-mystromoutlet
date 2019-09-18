var Service, Characteristic, FakeGatoHistoryService;
var request = require("request");
var inherits = require('util').inherits;
var pollingToEvent = require('polling-to-event');
var powerLoggingService;
var informationService;
var power = 0;
var ExtraPersistedData = {};
var totalPower = 10;
var refresh = 0;
var lastReset = 0;


//Initialize
module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	FakeGatoHistoryService = require('fakegato-history')(homebridge);

	CurrentpowerConsumption = function () {
		Characteristic.call(this, 'powerConsumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.UINT16,
			unit: "Watt",
			maxValue: 100000,
			minValue: 0,
			minStep: 1,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	CurrentpowerConsumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
	inherits(CurrentpowerConsumption, Characteristic);

	totalPowerConsumption = function () {
		Characteristic.call(this, 'totalPowerConsumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.FLOAT,
			unit: "kWh",
			maxValue: 100000000000,
			minValue: 0,
			minStep: 0.001,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	totalPowerConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';
	inherits(totalPowerConsumption, Characteristic);

	ResetTotal = function () {
		Characteristic.call(this, 'resetTotalPowerConsumption', 'E863F112-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.UINT32,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE]
		});
		this.value = this.getDefaultValue();
	};
	ResetTotal.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52';
	inherits(ResetTotal, Characteristic);

	
	homebridge.registerAccessory("homebridge-mystromoutlet", "MyStromOutlet", MyStromOutlet)
}

// function MyStromOutlet
function MyStromOutlet(log, config) {
	var self = this;
	this.log = log;
	this.name = config["name"];
	this.displayName = config["name"];
	this.url = config["url"];
	refresh = config["refreshSeconds"] * 1000 || 10000;

	this.informationService = new Service.AccessoryInformation();
	this.informationService
		.setCharacteristic(Characteristic.Name, this.name)
		.setCharacteristic(Characteristic.Manufacturer, "myStrom AG")
		.setCharacteristic(Characteristic.Model, "WLAN Switch")
		.setCharacteristic(Characteristic.SerialNumber, this.name);
	
	this.service = new Service.Outlet(this.name);

	this.service.getCharacteristic(Characteristic.On)
	.on('get', this.getState.bind(this))
	.on('set', this.setState.bind(this));
	
	this.service.getCharacteristic(Characteristic.OutletInUse)
	.on('get', this.getState.bind(this));
	
	this.service.getCharacteristic(CurrentpowerConsumption)
	.on('get', this.getpowerConsumption.bind(this));
	
	this.service.getCharacteristic(totalPowerConsumption)
	.on('get',  (callback) => {
 		this.ExtraPersistedData = this.powerLoggingService.getExtraPersistedData();
 		if (this.ExtraPersistedData != undefined) {
 			totalPower = this.ExtraPersistedData.totalPower;
// 			this.log("Power = %f, totalPower = %f", power, totalPower); 		
 		}
		callback(null, totalPower);
	});
	
	this.service.getCharacteristic(ResetTotal)
		.on('set', (value, callback) => {
			this.totalPower = 0;
			this.lastReset = value;
// 			this.log("totalPower = %f, lastReset = %d", this.totalPower, this.lastReset);
			this.powerLoggingService.setExtraPersistedData({ totalPower: this.totalPower, lastReset: this.lastReset });
			callback(null);
		})
		.on('get', (callback) => {
			this.ExtraPersistedData = this.powerLoggingService.getExtraPersistedData();
			if (this.ExtraPersistedData != undefined)
				this.lastReset = this.ExtraPersistedData.lastReset;
			callback(null, this.lastReset);
		});
	
	
	this.powerLoggingService = new FakeGatoHistoryService("energy", this, {storage: 'fs'});


	// setting up scheduled pulling
	emitter = pollingToEvent( function(done) {
		request.get(
			{url: self.url + "/report"},
			function(err, response, body) {
				if(err || response.statusCode != 200) {
					self.log("Error: %s", err);
				}
				done(err, body);
			}
		);	
	},
	{ longpolling: true, interval: refresh }
	);

	emitter.on("longpoll", function(data) {
// 		self.log("longpoll emitted at %s, with data %j", Date.now(), data);
		var totalPowerTemp = 0;

		var json = JSON.parse(data);
		if (self.powerLoggingService.isHistoryLoaded()) {
// 			self.log("HISTORY LOADED, totalPowerTemp = %f, json.power= %f, refresh = %s", totalPowerTemp, json.power, refresh);
			self.ExtraPersistedData = self.powerLoggingService.getExtraPersistedData();
			if (self.ExtraPersistedData != undefined && self.ExtraPersistedData.totalPower != undefined) {
// 				self.log("self.ExtraPersistedData = " + JSON.stringify(self.ExtraPersistedData));
				self.totalPower = self.ExtraPersistedData.totalPower + totalPowerTemp + json.power * refresh / 3600 / 1000;
// 				self.log("totalPower: %f, , lastReset: %s",  totalPower, self.ExtraPersistedData.lastReset);
				self.powerLoggingService.setExtraPersistedData({ totalPower: totalPower, lastReset: self.ExtraPersistedData.lastReset });
			}
			else {
// 				self.log("self.ExtraPersistedData is undefined");
				totalPower = totalPowerTemp + json.power * refresh / 3600 / 1000;
				self.powerLoggingService.setExtraPersistedData({ totalPower: totalPower, lastReset: 0 });
// 				self.log("totalPower: %f, , lastReset: %s",  totalPower, self.ExtraPersistedData.lastReset);
			}
			totalPowerTemp = 0;

		}
		else {
// 			self.log("HISTORY NOT LOADED");
			totalPowerTemp = totalPowerTemp + json.power * refresh / 3600 / 1000;
			totalPower = totalPowerTemp;
		}
		self.service.getCharacteristic(CurrentpowerConsumption).getValue(null);
		self.service.getCharacteristic(totalPowerConsumption).getValue(null);
		self.powerLoggingService.addEntry({ time: Date.now(), power: json.power });
	});
}

// getState
MyStromOutlet.prototype.getState = function(callback) {
// 	this.log("getState()");
	
	request.get(
		{url: this.url + "/report"},
		function(err, response, body) {
			if(!err && response.statusCode == 200) {
// 				this.log("body = %s", body);
				var json = JSON.parse(body);
				callback( null, json.relay);
			} else {
				this.log("Error: %s", err);
				callback(err);
			}
		}.bind(this)
	);
}

MyStromOutlet.prototype.getpowerConsumption = function(callback) {
// 	this.log("getpowerConsumption()");
	
	request.get(
		{url: this.url + "/report"},
		function(err, response, body) {
			if(!err && response.statusCode == 200) {
// 				this.log("body = %s", body);
				var json = JSON.parse(body);
				power = json.power;
// 				this.log("power = %f", power);
				callback( null, Math.round(json.power));
			} else {
				this.log("Error: %s", err);
				callback(err);
			}
		}.bind(this)
	);
}


// set State
MyStromOutlet.prototype.setState = function(state, callback) {
// 	this.log("setState(%s)", state);
	
	request.get(
		{url: this.url + "/toggle"},
		function(err, response, body) {
			if(!err && response.statusCode == 200) {
// 				this.log("body = %s", body);
				var json = JSON.parse(body);
				callback(null, json.relay);
			} else {
				this.log("Error setting state: %s", err);
				callback(err);
			}
		}.bind(this)
	);
	
}

MyStromOutlet.prototype.getServices = function() {
	return [this.informationService, this.service, this.powerLoggingService];
}