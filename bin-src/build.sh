#!/bin/bash
IP="/usr/include/firefox"
LP="/usr/lib/firefox-devel"
g++ -g -c -fPIC util.cpp module.cpp -I $IP -include "xpcom-config.h"
gcc -shared -Wl,-soname,fcutils.so -o fcutils.so util.o module.o -L"$LP/sdk/lib" -L"$LP/sdk/bin" -Wl,-rpath-link,"$LP/sdk/bin" -lxpcomglue_s -lxpcom -lnspr4 -lmozalloc
mkdir -p ../platform/Linux_x86-gcc3/components/
mv fcutils.so ../platform/Linux_x86-gcc3/components/
cp iutil.xpt ../components/
