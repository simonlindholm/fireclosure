#!/bin/bash
g++ -c -fPIC util.cpp module.cpp -I /usr/include/firefox-12.0a2/
gcc -shared -Wl,-soname,fcutils.so -o fcutils.so util.o module.o
mkdir -p ../platform/Linux_x86-gcc3/components/
mv fcutils.so ../platform/Linux_x86-gcc3/components/
cp iutil.xpt ../components/
