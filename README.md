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

## Usage
When opening the configuration for the first time enter only the google login data. Two factor authentification has to be disabled for the user.

## Troubleshooting
### instance indicator is green but no location data is received
In this case check the google account of the user that is used by the google-sharedlocations adapter. Log in with a browser and check if google blocked some logins. Click on a blocked login and confirm to google that this was you. Additionally check that two factor authentification is turned off.

## Changelog
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

known issued
- objects for fences have to be deleted manually when they are removed in the admin interface

## Disclaimer
I am not in any association with Google.

## License
The MIT License (MIT)

Copyright (c) 2017-2018 Christian Vorholt <chvorholt@gmail.com>

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
