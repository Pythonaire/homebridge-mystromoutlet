# homebridge-mystromoutlet
A simple Homebridge plugin for MyStrom outlets providing data to Elgato Eve app using Fakegato-History. The plugin does not support the MyStrom cloud and communicates directly with the outlet's JSON API.

## Installation
1. Install homebridge: `npm install -g homebridge`
2. Install this plugin: `npm install -g homebridge-mystromoutlet`

## Configuration

This plugin needs one accessory per outlet. Simply add a block similar to this

   {
      "accessory": "MyStromOutlet",
      "name": "The desired name",
      "url": "http://192.168.12.34",
      "refreshSeconds": 5
   }

where
- "accessory" has to be "MyStromOutlet"
- "name" is user defined and is used by fakegato-history to create history files
- "url" is the IP address of the outlet, prefixed with "http://"
- "refreshSeconds" tells the plugin how often to refresh data from the plug. Default is 10 seconds.

See the file config-example.json for a minimum configuration.

## Todo
- Add to npm.js
