![Logo](admin/google-sharedlocations.png)
ioBroker adapter for google-sharedlocations
=================
[![NPM version](http://img.shields.io/npm/v/iobroker.google-sharedlocations.svg)](https://www.npmjs.com/package/iobroker.google-sharedlocations)
[![Downloads](https://img.shields.io/npm/dm/iobroker.google-sharedlocations.svg)](https://www.npmjs.com/package/iobroker.google-sharedlocations)

[![NPM](https://nodei.co/npm/iobroker.google-sharedlocations.png?downloads=true)](https://nodei.co/npm/iobroker.google-sharedlocations/)

[![Build Status](https://travis-ci.org/t4qjXH8N/ioBroker.google-sharedlocations.svg?branch=master)](https://travis-ci.org/t4qjXH8N/ioBroker.google-sharedlocations)
[![Build status](https://ci.appveyor.com/api/projects/status/d5rora9wgp7otg23/branch/master?svg=true)](https://ci.appveyor.com/project/t4qjXH8N/iobroker-google-sharedlocations/branch/master)

## Description
This is an ioBroker-adapter that can retrieve the location data of users that are sharing their location via google shared locations. It can not retrieve the location of the user that is used to access google. 

Circularly shaped geofences can be defined in the adapter config. These geofences can be associated with users, i.e. that a state is toogled if the user enters or leaves a geofence.

The adapter can receive and process a bunch of messages, please have a look at main.js for details. Sometimes the recovery email address has to be used to solve a challenge by Googles, therefore it may have to be entered in the adapter. 

## Usage
There are three possibilities to login into your Google account. The first possibility is to enter your account credentials and the recovery email address associated with the account. If the first possibility fails, use the second possibility . The second possibility retrieves the cookie using a proxy. If the second possibility fails, you can enter the cookie directly. Two factor authentification has to be disabled for the user. 

## Troubleshooting
### instance indicator is green but no location data is received or instance indicator is yellow and the log says "please login manually" 
In this case check the google account of the user that is used by the google-sharedlocations adapter. Log in with a browser and check if google blocked some logins. Click on a blocked login and confirm to google that this was you. Additionally check that two factor authentification is turned off.

If you still experience problems please open an issue. Please set the adapter level to debug and publish the log there. Otherwise I have no change to help.

## Donation
If this project helped you to reduce developing time, you can give me a cup of coffee or a bottle of beer via PayPal(chvorholt@gmail.com) :-)  

## Changelog
#### 1.6.0 (12-Jan-2019)
- cookie can be retrieved via proxy (experimental)
- reduced verbosity

#### 1.5.2 (19-Sep-2018)
- fence was not updated correctly

#### 1.5.1 (17-Sep-2018)
- changed location of trigger poll state 
- states are now members of named groups.

#### 1.5.0 (16-Sep-2018)
- added GPS position accuracy
- adapter should be more robust against datagram changes

#### 1.4.1 (16-Sep-2018)
- fixed places adapter support
- fixed translation issue with polling

#### 1.4.0 (16-Sep-2018)
- fences id can be determined by the user
- fences are properly added and removed now

#### 1.3.0 (14-Sep-2018)
- locations poll can be triggered by a state or by sending a message ("triggerPoll") to the adapter

#### 1.2.0 (13-Sep-2018)
- added state showing battery level and timestamp (solves #11)

#### 1.1.4 (13-Sep-2018)
- fixed roles

#### 1.1.3 (1-Sep-2018)
- Fixed installation problem

#### 1.1.2 (15-Aug-2018)
- Preparations for publishing the adapter

#### 1.1.1 (11-Aug-2018)
- Users can be simply selected in the admin config, i.e. userid need not to be entered manually

#### 1.1.0 (06-Aug-2018)
- Current address of the users is stored in a state 

#### 1.0.1 (05-Aug-2018)
- Code cleanup
- Moved authentification to its own module

#### 1.0.0 (17-Jul-2018)
- Added support for Admin3.

#### 0.0.7 (15-Jul-2018)
- Google makes it hard to mimic a user login. Improved login procedure.
- Minimum polling interval must be greater than 30s.

#### 0.0.6 (22-Apr-2018)
- Added support for [ioBroker.places adapter](https://github.com/BasGo/ioBroker.places)

#### 0.0.5 (20-Apr-2018)
- Fixed error that occurs when no fences exist

#### 0.0.4 (24-Feb-2018)
- Adapter does no longer crash if location data of a user has not been updated for a long time

#### 0.0.3 (13-Feb-2018)
- google had changed something in their authentification routine that made some changes necessary
- several bugfixes

#### 0.0.2 (02-Jan-2018)
- improved descriptions
- several bugfixes

#### 0.0.1 (31-Dec-2017)
- basic features tested

## Known issues
- objects for fences have to be deleted manually when they are removed in the admin interface

## Disclaimer
I am not in any association with Google.

## License
The MIT License (MIT)

Copyright (c) 2017-2019 Christian Vorholt <chvorholt@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
