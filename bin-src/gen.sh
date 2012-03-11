#!/bin/bash
python /usr/lib/firefox-devel/sdk/bin/header.py --cachedir=. -o iutil.h iutil.idl -I /usr/share/idl/firefox/
python /usr/lib/firefox-devel/sdk/bin/typelib.py --cachedir=. -o iutil.xpt iutil.idl -I /usr/share/idl/firefox/
