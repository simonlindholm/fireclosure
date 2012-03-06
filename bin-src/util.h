#pragma once
#include "iutil.h"

#define MY_CONTRACTID "@simonsoftware.se/nsFireClosureUtils;1"
#define MY_CID {0xD2A97006, 0x6704, 0x11E1, \
    { 0xa9, 0x5b, 0x49, 0xaf, 0x48, 0x24, 0x01, 0x9b }}

class nsFireClosureUtils : public nsIFireClosureUtils
{
public:
    NS_DECL_ISUPPORTS
    NS_DECL_NSIFIRECLOSUREUTILS
    nsFireClosureUtils();
    ~nsFireClosureUtils();
};
