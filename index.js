var Service, Characteristic;

const Purifier = require('./src/purifier');
const Authenticator = require('./src/authenticator');
const constants = require('./src/constants');

class Airmega {
  constructor(log, config) {
    this.name = config['name'];
    this.includeLight = config['include_light'];
    this.log = log;
  
    var authenticator = new Authenticator({
      deviceName: config['device_name'],
      email: config['email'],
      password: config['password'],
      log: this.log
    });
  
    authenticator.authenticate().then((data) => {
      this.purifier = new Purifier({
        userToken: data.userToken,
        deviceId: data.deviceId,
        debug: config['debug'],
        log: this.log
      });

      this.purifier.getLatestData();
    });
  }

  getServices() {
    let informationService = new Service.AccessoryInformation();
    let purifierService = new Service.AirPurifier(this.name);
    let airQualityService = new Service.AirQualitySensor(this.name);
    let lightService = new Service.Lightbulb(this.name);    
    let preFilterService = new Service.FilterMaintenance('Pre Filter', 'pre');
    let mainFilterService = new Service.FilterMaintenance('Max2 Filter', 'main'); 

    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Coway')
      .setCharacteristic(Characteristic.Model, 'Airmega')
      .setCharacteristic(Characteristic.SerialNumber, '123-456-789');

    purifierService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getActiveCharacteristic.bind(this))
      .on('set', this.setActiveCharacteristic.bind(this));

    purifierService
      .getCharacteristic(Characteristic.CurrentAirPurifierState)
      .on('get', this.getCurrentAirPurifierState.bind(this));

    purifierService
      .getCharacteristic(Characteristic.TargetAirPurifierState)
      .on('get', this.getTargetAirPurifierState.bind(this))
      .on('set', this.setTargetAirPurifierState.bind(this));

    purifierService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getRotationSpeed.bind(this))
      .on('set', this.setRotationSpeed.bind(this));

    airQualityService
      .getCharacteristic(Characteristic.AirQuality)
      .on('get', this.getAirQuality.bind(this));

    lightService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getLight.bind(this))
      .on('set', this.setLight.bind(this));

    preFilterService
      .getCharacteristic(Characteristic.FilterChangeIndication)
      .on('get', this.getPreFilterChangeIndication.bind(this));

    preFilterService
      .getCharacteristic(Characteristic.FilterLifeLevel)
      .on('get', this.getPreFilterLifeLevel.bind(this));

    mainFilterService
      .getCharacteristic(Characteristic.FilterChangeIndication)
      .on('get', this.getMainFilterChangeIndication.bind(this));

    mainFilterService
      .getCharacteristic(Characteristic.FilterLifeLevel)
      .on('get', this.getMainFilterLifeLevel.bind(this));

    this.purifierService = purifierService;

    var services = [
      informationService,
      purifierService,
      airQualityService,
      preFilterService,
      mainFilterService
    ];

    if (this.includeLight) {
      services.push(lightService);
    }

    return services;
  }

  getActiveCharacteristic(callback) {
    if (this.purifier == null) return;

    if (this.purifier.power) {
      this.log('Purifier is on');
      callback(null, Characteristic.Active.ACTIVE);
    } else {
      this.log('Purifier is off');
      callback(null, Characteristic.Active.INACTIVE);
    }
  }

  setActiveCharacteristic(targetState, callback) {
    if (this.purifier == null) return;

    // Only toggle power when new state is different.
    // Prevents extraneous calls especially when changing
    // the fan speed (setRotationSpeed ensures device is on).
    if (this.purifier.power == targetState) {
      callback(null);
      return;
    }

    this.purifier.setPower(targetState).then(() => {
      this.log(`Setting power to ${targetState}`);      

      // Need to set the current purifier state characteristic here
      // otherwise accessory hangs on 'Turning on...'/'Turning off...'
      if (targetState) {
        this.purifierService.setCharacteristic(Characteristic.CurrentAirPurifierState, Characteristic.CurrentAirPurifierState.PURIFYING_AIR);   
      } else {
        this.purifierService.setCharacteristic(Characteristic.CurrentAirPurifierState, Characteristic.CurrentAirPurifierState.INACTIVE);
      }

      callback(null);
    }).catch((err) => {
      this.log(err);
      callback(err);
    });
  }

  getCurrentAirPurifierState(callback) {
    if (this.purifier == null) return;

    this.purifier.getLatestData();

    if (!this.purifier.power) {
      this.log('Current state is inactive');
      callback(null, Characteristic.CurrentAirPurifierState.INACTIVE);
      return;
    }

    if (this.purifier.fanSpeed == 0 || this.purifier.mode == 2 || this.purifier.mode == 6) {
      this.log('Current state is idle');
      callback(null, Characteristic.CurrentAirPurifierState.IDLE);
      return;
    }

    this.log('Current state is purifying');
    callback(null, Characteristic.CurrentAirPurifierState.PURIFYING_AIR);
  }

  getTargetAirPurifierState(callback) {
    if (this.purifier == null) return;

    if (this.purifier.mode == 0) {
      this.log('Target purifier state is manual');
      callback(null, Characteristic.TargetAirPurifierState.MANUAL);
    } else {
      this.log('Target purifier state is auto');
      callback(null, Characteristic.TargetAirPurifierState.AUTO);     
    }
  }

  setTargetAirPurifierState(targetState, callback) {
    if (this.purifier == null) return;

    let targetMode;
    if (targetState) {
      this.log('Setting mode to auto');
      targetMode = -1;
    } else {
      this.log('Setting mode to manual');
      targetMode = 1;
    }

    this.purifier.setFanSpeed(targetMode).then(() => {
      callback(null);
    }).catch((err) => {
      this.log(err);
      callback(err);
    });
  }

  getRotationSpeed(callback) {
    if (this.purifier == null) return;
    
    let intervals = {1: 20, 2: 50, 3: 100};
    let fanSpeed = intervals[this.purifier.fanSpeed];
    
    this.log(`Rotation speed is ${fanSpeed}`);
    callback(null, fanSpeed);
  }

  setRotationSpeed(targetState, callback) {
    if (this.purifier == null) return;

    let targetSpeed;
    let ranges = {1: [0, 40], 2: [40, 70], 3: [70, 100]};

    for (var key in ranges) {
      var currentSpeed = ranges[key];

      if (targetState > currentSpeed[0] && targetState <= currentSpeed[1]) {
        targetSpeed = key;
        break;
      }
    }

    this.log(`Setting rotation speed to ${targetSpeed}`);

    this.purifier.setFanSpeed(targetSpeed).then(() => {
      callback(null);
    }).catch((err) => {
      this.log(err);
      callback(err);
    });
  }

  getAirQuality(callback) {
    if (this.purifier == null) return;
    
    let result;
    switch (this.purifier.airQuality) {
      case 1:
        result = Characteristic.AirQuality.EXCELLENT;
        break;
      case 2:
        result = Characteristic.AirQuality.GOOD;
        break;
      case 3:
        result = Characteristic.AirQuality.FAIR;
        break;
      case 4:
        result = Characteristic.AirQuality.INFERIOR;
        break;
    }

    callback(null, result);
  }

  getLight(callback) {
    if (this.purifier == null) return;

    callback(null, this.purifier.getLightOn());
  }

  setLight(targetState, callback) {
    if (this.purifier == null) return;

    this.log(`Turning light ${(targetState ? 'on' : 'off')}`);
    
    this.purifier.setLightOn(targetState).then(() => {
      callback(null);
    }).catch((err) => {
      this.log(err);
      callback(err);
    });
  }

  getPreFilterChangeIndication(callback) {
    if (this.purifier == null) return;

    if (this.purifier.preFilterAlarm) {
      callback(null, Characteristic.FilterChangeIndication.CHANGE_FILTER);
    } else {
      callback(null, Characteristic.FilterChangeIndication.FILTER_OK);
    }
  }

  getPreFilterLifeLevel(callback) {
    if (this.purifier == null) return;
    
    this.purifier.getFilterLifeLevels().then((data) => {
      callback(null, data.prefilter);
    }).catch((err) => {
      this.log(err);
      callback(err);
    });
  }

  getMainFilterChangeIndication(callback) {
    if (this.purifier == null) return;
    
    if (this.purifier.mainFilterAlarm) {
      callback(null, Characteristic.FilterChangeIndication.CHANGE_FILTER);
    } else {
      callback(null, Characteristic.FilterChangeIndication.FILTER_OK);
    }
  }

  getMainFilterLifeLevel(callback) {
    if (this.purifier == null) return;
    
    this.purifier.getFilterLifeLevels().then((data) => {
      callback(null, data.hepafilter);
    }).catch((err) => {
      this.log(err);
      callback(err);
    });
  }
}

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-airmega', 'Airmega', Airmega);
};