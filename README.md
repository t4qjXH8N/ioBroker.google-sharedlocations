# ioBroker.google-sharedlocations
=================

## Description
This is an ioBroker-adapter that can retrieve the location data of users that are sharing their location via google shared locations. It can not retrieve the location of the user that is used to access google.

## Usage
When opening the configuration for the first time enter only the google login data. After the first run of the instance you can get the user ids from the objects page from the folder of the adapter instance. These ids have to be used in the configuration to identify users.


## Changelog
#### 0.0.1 (2017-12-31)
- basic features tested

known issued
- objects for fences have to be deleted manually

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