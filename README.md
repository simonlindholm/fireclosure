FireClosure
===========
[Download](http://simonsoftware.se/other/fb/fireclosure-0.2b2.xpi) (Firefox 14.0a1 and upwards)

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
- There might be security holes.
- It currently doesn't work when stopped on a breakpoint. (Waiting on Firebug [issue 5321](http://code.google.com/p/fbug/issues/detail?id=5321).)

Building
--------
To create the XPI, download [Apache Ant](http://ant.apache.org/) and run `ant` in the project directory.
