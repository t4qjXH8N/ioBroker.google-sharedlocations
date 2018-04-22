![Logo](admin/google-sharedlocations.png)
# ioBroker.google-sharedlocations
=================

## Description
This is an ioBroker-adapter that can retrieve the location data of users that are sharing their location via google shared locations. It can not retrieve the location of the user that is used to access google.

## Usage
When opening the configuration for the first time enter only the google login data. After the first run of the instance you can get the user ids from the objects page from the folder of the adapter instance. These ids have to be used in the configuration to identify users. Two factor authentification has to be disabled for the user.

## Troubleshooting
### instance indicator is green but no location data is received
In this case check the google account of the user that is used by the google-sharedlocations adapter. Log in with a browser and check if google blocked some logins. Click on a block login and confirm to google that this was you. Additionally check that two factor authentification is turned off.

## Changelog
#### 0.0.6 (2018-04-22)
- Added support for [ioBroker.places adapter](https://github.com/BasGo/ioBroker.places)

#### 0.0.5 (2018-04-20)
- Fixed error that occurs when no fences exist

#### 0.0.4 (2018-02-24)
- Adapter does no longer crash if location data of a user has not been updated for a long time

#### 0.0.3 (2018-02-13)
- google had changed something in their authentification routine that made some changes necessary
- several bugfixes

#### 0.0.2 (2018-01-02)
- improved descriptions
- several bugfixes

#### 0.0.1 (2017-12-31)
- basic features tested

known issued
- objects for fences have to be deleted manually when they are removed in the admin interface

## Disclaimer
I am not in any association with Google.

## License
The MIT License (MIT)

Copyright (c) 2017-2018 Christian Vorholt <chvorholt@mail.com>

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