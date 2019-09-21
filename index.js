var Service, Characteristic, FakeGatoHistoryService;
var request = require("request");
var inherits = require('util').inherits;
var pollingToEvent = require('polling-to-event');
var powerLoggingService;
var informationService;
var power = 0;
var ExtraPersistedData = {};
var totalPower = 0;
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
 		}
		callback(null, totalPower);
	});
	
	this.service.getCharacteristic(ResetTotal)
		.on('set', (value, callback) => {
			this.totalPower = 0;
			this.lastReset = value;
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
		var totalPowerTemp = 0;

		var json = JSON.parse(data);
		if (self.powerLoggingService.isHistoryLoaded()) {
			self.ExtraPersistedData = self.powerLoggingService.getExtraPersistedData();
			if (self.ExtraPersistedData != undefined && self.ExtraPersistedData.totalPower != undefined) {
				self.totalPower = self.ExtraPersistedData.totalPower + totalPowerTemp + json.power * refresh / 3600 / 1000;
				self.powerLoggingService.setExtraPersistedData({ totalPower: totalPower, lastReset: self.ExtraPersistedData.lastReset });
			}
			else {
				totalPower = totalPowerTemp + json.power * refresh / 3600 / 1000;
				self.powerLoggingService.setExtraPersistedData({ totalPower: totalPower, lastReset: 0 });
			}
			totalPowerTemp = 0;

		}
		else {
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
	request.get(
		{url: this.url + "/report"},
		function(err, response, body) {
			if(!err && response.statusCode == 200) {
				var json = JSON.parse(body);
				callback( null, json.relay);
			} else {
				this.log("Error: %s", err);
			}
		}.bind(this)
	);
}

MyStromOutlet.prototype.getpowerConsumption = function(callback) {
	request.get(
		{url: this.url + "/report"},
		function(err, response, body) {
			if(!err && response.statusCode == 200) {
				var json = JSON.parse(body);
				power = json.power;
				callback( null, Math.round(json.power));
			} else {
				this.log("Error: %s", err);
			}
		}.bind(this)
	);
}


// set State
MyStromOutlet.prototype.setState = function(state, callback) {
	let requestUrl = this.url + "/relay?state=" + (state ? "1" : "0");
	
	request.get(
		{url: requestUrl},
		function(err, response, body) {
			if(!err && response.statusCode == 200) {
				callback();
			} else {
				callback(err);
			}
		}.bind(this)
	);
	
}

MyStromOutlet.prototype.getServices = function() {
	return [this.informationService, this.service, this.powerLoggingService];
}