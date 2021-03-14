# Bad Ideas Toolkit

## WARNING:  This module contains functions which will allow tech-savvy players to completely bypass permissions on all Entity types.  If you don't trust your players, don't install this.

This is a library module, it does nothing on its own, but provides several functions for use in macros or by other modules.

Mainly, these functions are intended to help with making macros for use with MidiQoL, DAE, and similar automation modules.

## Functions Provided

All functions are accessible at `game.modules.get("bad-ideas-toolkit").api.functionName`, e.g. `game.modules.get("bad-ideas-toolkit").api.isMainGM()`.  Alternatively, `badIdeas.functionName` will be created if available (i.e. if it doesn't already exist in the globalThis object) as a convenience accessor.  I don't think there *should* be clashes, but if there are then whatever is clashing with this will win.

This is set up as a hook on "init", so won't be available before then, and probably not in other "init" hooks.

### Utility

`isMainGM()` :  Returns true if the current user is the first active GM.  Equivalent to `game.users.find((u) => u.isGM && u.active)`

`async entityFromUuid(uuid)` : Returns an Entity of the appropriate type (Scene, Token, Actor, etc.) for any UUID in the world (i.e. not in a compendium), including UUIDs for embedded entities.  If this fails for any object, please add an issue to this repo.  Where a base entity type is extended (e.g. Actor5e from Actor) this generally will return an object of the base entity type, rather than the extended type.

### GM escalation

All the functions here can be called by anyone, and will then be executed by the GM.  This allows users to update or delete __**pretty much anything**__ if they have enough macro knowledge.  Don't install this if you don't trust your users.

`entityGetFlag(entity, scope, flag) , entitySetFlag(entity, scope, flag, value) , entityUnsetFlag(entity, scope, flag)` : gets/sets/unsets the flag specified by `scope, flag` for the entity specified by `entity` (which needs to be the actual Entity object).

`entityUpdate(entity, newData, options)` : calls `entity.update(newData, options)` on the GM side.

`entityDelete(entity, options)` : calls `entity.delete(options)` on the GM side

`applyCUBCondition(condition, entity) , removeCUBCondition(condition, entity)` uses Combat Utility Belt to apply/remove the specified condition.  `condition` is the name of the condition (as a string), `entity` is the Entity (i.e. Token or Actor) to apply/remove the condition to/from.  This will return `false` if CUB is not active in the world (and handling that is your problem!)

Other than as stated above, these functions do not provide return values, so may not be a direct substitute for the equivalent Foundry API functions in all cases.

## Contributing

If you want a particular function in here, feel free to throw an issue on this, and I'll get to it eventually.

Pull reqeusts are also welcome - in general, when making something for use playerside to be passed to the GM, you should create one function within the `api` object, and one within the `handlers` object, as follows:

```js
api = {
    doThing(entity, arg1, arg2){
        const data = {uuid: entity.uuid, arg1, arg2}
        handlerBridge(data, "doThing")
    }
}

handlers = {
    async doThingHandler(data){
        const entity = await api.entityFromUuid(data.uuid);
        entity.thing(data.arg1, data.arg2) //or
        thing(entity, data.arg1, data.arg2) //or whatever function you want to do on GM side here.
    }
}
```

Functions which just run playerside only need to be within the api object.  Helper functions which run playerside but aren't intended to be publicly usable should be added outside of either object (e.g. where handlerBridge() is).  The `functionName` argument for `handlerBridge(data, functionName)` must match up with the name of the handler function (i.e. so the handler is called functionNameHandler).  It doesn't need to match up with the name of the playerside function, but there should be a good reason for the mismatch if you're doing this (e.g. to use the same handler for two different base functions)

Use of Entity.uuid before passing things into the handlerBridge, and then decoding them with `entity = await api.entityFromUuid(uuid)` is encouraged, since this reduces the amount of data going over the socket, and reduces the potential for errors. 


