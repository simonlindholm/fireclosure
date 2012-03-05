#!/bin/bash
python /usr/lib/firefox-devel-12.0a2/sdk/bin/header.py --cachedir=. -o iutil.h iutil.idl -I /usr/share/idl/firefox-12.0a2/
python /usr/lib/firefox-devel-12.0a2/sdk/bin/typelib.py --cachedir=. -o iutil.xpt iutil.idl -I /usr/share/idl/firefox-12.0a2/
