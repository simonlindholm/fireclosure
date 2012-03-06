#include <mozilla/ModuleUtils.h>
#include "util.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(nsFireClosureUtils)

NS_DEFINE_NAMED_CID(MY_CID);

static const mozilla::Module::CIDEntry kCIDs[] = {
    { &kMY_CID, false, NULL, nsFireClosureUtilsConstructor },
    { NULL }
};

static const mozilla::Module::ContractIDEntry kContracts[] = {
    { MY_CONTRACTID, &kMY_CID },
    { NULL }
};

static const mozilla::Module kModule = {
    mozilla::Module::kVersion,
    kCIDs,
    kContracts,
    NULL
};

NSMODULE_DEFN(nsFireClosureUtilsModule) = &kModule;
