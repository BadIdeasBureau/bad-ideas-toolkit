Hooks.once('init', async function() {
    game.socket.on(`module.bad-ideas-toolkit`, async (data) => {
        if(data.operation === "return"){
            const resolve = _requestResolvers[data.randomID];
            if (resolve){
                delete _requestResolvers[data.randomID];
                if(data.retVal.uuid) data.retVal.result = await api.entityFromUuid(data.retVal.result) //recompose from UUID if it was minified down to it
                resolve(data.retVal)
            }
        } else {
            const handlerFunction = data.operation+"Handler"
            handlers[handlerFunction](data);
        }
    });
    game.modules.get("bad-ideas-toolkit").api = api
    if(!globalThis.badIdeas) {globalThis.badIdeas = api} //register convenience object if it's not already in use
});

const _requestResolvers = {};

const api = {
    isMainGM(){
        return game.user === game.users.find((u) => u.isGM && u.active)
    },

    async applyCUBCondition(condition,entity) {
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        const content = {condition, uuid: entity.uuid};
        return handlerBridge(content, "applyCUBCondition")
    },

    async removeCUBCondition(condition,entity){
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        const content = {condition, uuid: entity.uuid};
        return handlerBridge(content, "removeCUBCondition")
    },

    async entityGetFlag(entity, scope, flag){
        const content = {uuid: entity.uuid, scope,flag};
        return handlerBridge(content,"entityGetFlag")
    },

    async entitySetFlag(entity, scope, flag, value){
        const content = {uuid: entity.uuid, scope,flag, value};
        return handlerBridge(content,"entitySetFlag")
    },

    async entityUpdate(entity, newData, options){
        const content = {uuid: entity.uuid, newData, options};
        return handlerBridge(content,"entityUpdate")
    },

    async entityDelete(entity, options){
        const content = {uuid: entity.uuid, options};
        return handlerBridge(content,"entityDelete")
    },

    async entityFromUuid(uuid){ //allows recovery of the actual Entity instance from a uuid, even for embedded entities.
        let entity = await fromUuid(uuid);
        if (entity instanceof Entity){ //everything is nice, it's a base entity, we can just return that.
            return entity
        }
        const sections = uuid.split(".");
        let tempUuid = (`${sections[0]}.${sections[1]}`)
        entity = await fromUuid(tempUuid);
        let index = 2;
        while (index<sections.length){
            index+=2;
            tempUuid = `${tempUuid}.${sections[index-2]}.${sections[index-1]}`
            let data = await fromUuid(tempUuid);
            switch (sections[index-2]){
                case "Item":
                    entity = Item.createOwned(data,entity);
                    break;
                case "ActiveEffect":
                    entity = new ActiveEffect(data, entity);
                    break;
                case "Tile":
                    entity = new Tile(data, entity);
                    break;
                case "Token":
                    entity = new Token(data, entity);
                    break;
                case "Drawing":
                    entity = new Drawing(data, entity);
                    break;
                case "MeasuredTemplate":
                    entity = new MeasuredTemplate(data, entity);
                    break;
                case "AmbientLight":
                    entity = new AmbientLight(data, entity);
                    break;
                case "AmbientSound":
                    entity = new AmbientSound(data, entity);
                    break;
                case "Wall":
                    entity = new Wall(data, entity);
                    break;
                case "Note":
                    entity = new Note(data, entity);
                    break;
                default:
                    throw "Error: Unsupported Embedded Entity Type (BadIdeas Toolkit)"
            }
        }
        return entity;
    }
}

function getUniqueID(){
    return `${game.user.id}-${Date.now()}-${randomID()}`
}

async function handlerBridge(content, functionName){  //if the user is the main GM, executes the handler directly.  otherwise, emits an instruction to execute over a socket.
    const methodResponse = await new Promise((resolve, reject) => {
        const randomID = getUniqueID();
        _requestResolvers[randomID] = resolve;
        if (api.isMainGM()){
            const handlerFunctionName = `${functionName}Handler`
            handlers[handlerFunctionName]({content, randomID, user: game.user.id})
        }else{ 
            game.socket.emit('module.bad-ideas-toolkit', {
                operation: functionName,
                user: game.user.id,
                content,
                randomID
            })
        };
        setTimeout(() =>{
            delete _requestResolvers[randomID];
            reject(new Error ("timed out waiting for GM execution"));
        }, 5000)
    })

    if (methodResponse.error)
        throw new Error(methodResponse.error)
    else
        return methodResponse.result;
}

function returnBridge(retVal, data){
    console.log(retVal)
    if (retVal.result.uuid){ //if it has one, decompose it to its UUID
        retVal.result = retVal.result.uuid;
        retVal.uuid = true
    }
    console.log(retVal)
    if (data.user === game.user.id){
        const resolve = _requestResolvers[data.randomID];
            if (resolve){
                delete _requestResolvers[data.randomID];
                resolve(retVal)
            }
        return;
    }
    game.socket.emit("module.bad-ideas-toolkit", {
        operation: "return",
        user: game.user.id,
        retVal,
        randomID: data.randomID
    })
}

const handlers = {
    async applyCUBConditionHandler(data){
        if(!api.isMainGM()) return;
        const condition = data.content.condition;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await game.cub.addCondition(condition, entity)
        returnBridge(retVal, data)
    },

    async removeCUBConditionHandler(data){
        if(!api.isMainGM()) return;
        const condition = data.content.condition;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await game.cub.removeCondition(condition, entity)
        returnBridge(retVal, data)
    },

    async entityGetFlagHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.getFlag(data.content.scope, data.content.flag)
        returnBridge(retVal, data)
    },

    async entitySetFlagHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.setFlag(data.content.scope, data.content.flag, data.content.value)
        returnBridge(retVal, data)
    },

    async entityUpdateHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.update(data.content.newData, data.content.options)
        returnBridge(retVal, data)
    },

    async entityDeleteHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.delete(data.content.options)
        returnBridge(retVal, data)
    }

}