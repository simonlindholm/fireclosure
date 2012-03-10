/*
 * Fake the declaration of JSFunction.
 * (I'm too lazy to download the actual source.)
 */

#include <jscell.h>
#include <stdint.h>

class HeapSlot;

namespace js {
    typedef JSNative Native;

    namespace types {
        class TypeObject;
        class Shape;
    };

    template<class T, typename Unioned = uintptr_t>
    class HeapPtr
    {
        private:
            union {
                T *value;
                Unioned other;
            };
    };

    typedef HeapPtr<types::TypeObject> HeapPtrTypeObject;
    typedef HeapPtr<types::Shape> HeapPtrShape;

    class ObjectImpl : public gc::Cell {
        protected:
            HeapPtrShape shape_;
            HeapPtrTypeObject type_;

            HeapSlot* slots;
            HeapSlot* elements;
    };
};

class JSObject : public js::ObjectImpl {
};

struct JSFunction : public JSObject
{
    uint16_t        nargs;        /* maximum number of specified arguments,
                                     reflected as f.length/f.arity */
    uint16_t        flags;        /* flags, see JSFUN_* below and in jsapi.h */
    union U {
        struct Native {
            js::Native  native;   /* native method pointer or null */
            js::Class   *clasp;   /* class of objects constructed
                                     by this function */
        } n;
        struct Scripted {
            JSScript    *script_; /* interpreted bytecode descriptor or null;
                                     use the accessor! */
            JSObject    *env_;    /* environment for new activations;
                                     use the accessor! */
        } i;
        void            *nativeOrScript;
    } u;
    JSAtom          *atom;        /* name for diagnostics and decompiling */
    inline JSObject *environment() const { return u.i.env_; }
};
