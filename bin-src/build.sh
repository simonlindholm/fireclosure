#!/bin/bash
IP="/usr/include/firefox"
LP="/usr/lib/firefox-devel"
g++ -g -c -fPIC util.cpp module.cpp -I $IP -include "xpcom-config.h"
gcc -shared -Wl,-soname,fcutils.so -o fcutils.so util.o module.o -L"$LP/sdk/lib" -L"$LP/sdk/bin" -Wl,-rpath-link,"$LP/sdk/bin" -lxpcomglue_s -lxpcom -lnspr4 -lmozalloc
cp iutil.xpt ../components/
mkdir -p ../components/Linux_x86-gcc3/12.0a2/
mv fcutils.so ../components/Linux_x86-gcc3/12.0a2/
