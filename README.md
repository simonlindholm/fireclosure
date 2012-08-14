FireClosure
===========
[Download](https://github.com/downloads/simonlindholm/fireclosure/fireclosure-0.2b6.xpi) (Firefox 14 and upwards, with Firebug 1.10)

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

You can also see the closures in various DOM views, under the subheading "(scoped variables)".

Caveats
-------
- Firefox often [optimizes away closures or variables](https://developer.mozilla.org/En/SpiderMonkey/Internals/Functions#Script_functions). For debugging, you can temporarily add some `eval`s around the relevant places in the code to make this less of a problem (also makes your code less performant).
- Some objects might have unexpected scopes. This is because non-function objects don't actually have scopes in the first place; the functionality is faked by using the first property with typeof === 'function' that appears on the object.

Building
--------
To create the XPI, download [Apache Ant](http://ant.apache.org/) and run `ant` in the project directory.
