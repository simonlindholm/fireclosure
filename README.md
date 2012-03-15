FireClosure
===========
[Download](http://simonsoftware.se/other/fb/fireclosure-1.xpi) (x86 Linux, Firefox 12.0a2)

FireClosure is an experimental Firebug extension that allows you to access closed-over ("private") variables in JavaScript, without having to mess around with tedious breakpoints.

For instance, given the following code...

``` javascript
function A() {
    var priv = 0;
    this.getter = function() {
        return priv;
    };
    this.setter = function(x) {
        priv = x;
    };
}
a = new A;
```
... FireClosure makes getting the value of `priv` as easy as `a.%priv`.

Caveats
-------
- Firefox often [optimizes away closures or variables](https://developer.mozilla.org/En/SpiderMonkey/Internals/Functions#Script_functions). For debugging, you can temporarily add some `eval`s around the relevant places in the code to make this less of a problem (also makes your code less performant).
- Being a proof-of-concept, little thought has been given to security. It is very likely that this opens potential security holes for malicious websites. (Will be fixed, some day.)
- It currently doesn't work when stopped on a breakpoint. (Waiting on Firebug [issue 5321](http://code.google.com/p/fbug/issues/detail?id=5321).)

Building
--------
FireClosure makes use of a binary component for getting the scope chain of a function. On Ubuntu, you might be able to compile it as such (change the paths and version numbers in chrome.manifest, install.rdf and build.sh to match):

```
sudo apt-get install firefox-dev
cd bin-src/
./gen.sh
./build.sh
```

To create the final XPI, run `ant` in the project directory (requires [Apache Ant](http://ant.apache.org/)).
