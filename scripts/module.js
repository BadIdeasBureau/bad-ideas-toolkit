Hooks.once('init', async function() {
    game.socket.on(`module.bad-ideas-toolkit`, (data) => {
        handlers[data.operation+"handler"](data);
    });
    game.modules.get("bad-ideas-toolkit").api = api
    if(!globalThis.badIdeas) {globalThis.badIdeas = api} //register convenience object if it's not already in use
});

const api = {
    isMainGM(){
        return game.user === game.users.find((u) => u.isGM && u.active)
    },

    applyCUBCondition(condition,entity) {
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        const data = {condition, uuid: entity.uuid};
        handlerBridge(data, "applyCUBCondition")
    },

    removeCUBCondition(condition,entity){
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        const data = {condition, uuid: entity.uuid};
        handlerBridge(data, "removeCUBCondition")
    },

    entityGetFlag(entity, scope, flag){
        const data = {uuid: entity.uuid, scope,flag};
        handlerBridge(data,"entityGetFlag")
    },

    entitySetFlag(entity, scope, flag, value){
        const data = {uuid: entity.uuid, scope,flag, value};
        handlerBridge(data,"entitySetFlag")
    },

    entityUpdate(entity, newData, options){
        const data = {uuid: entity.uuid, newData, options};
        handlerBridge(data,"entityUpdate")
    },

    entityDelete(entity, options){
        const data = {uuid: entity.uuid, options};
        handlerBridge(data,"entityDelete")
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
            data = await fromUuid(tempUuid);
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

function handlerBridge(data, functionName){  //if the user is the main GM, executes the handler directly.  otherwise, emits an instruction to execute over a socket.
    if (api.isMainGM())
        {handlers[functionName+"handler"](data)}
    else{ 
        game.socket.emit('module.bad-ideas-toolkit', {
            operation: functionName,
            user: game.user.id,
            content: data
        })
    };
}

const handlers = {
    applyCUBConditionHandler(data){
        if(!api.isMainGM()) return;
        let condition = data.condition;
        let entity = await api.entityFromUuid(data.uuid);
        game.cub.addCondition(condition, entity)
    },

    removeCUBConditionHandler(data){
        if(!api.isMainGM()) return;
        let condition = data.condition;
        let entity = await api.entityFromUuid(data.uuid);
        game.cub.removeCondition(condition, entity)
    },

    async entityGetFlagHandler(data){
        if(!api.isMainGM()) return;
        let entity = await api.entityFromUuid(data.uuid);
        entity.getFlag(data.scope, data.flag)
    },

    async entitySetFlagHandler(data){
        if(!api.isMainGM()) return;
        let entity = await api.entityFromUuid(data.uuid);
        entity.setFlag(data.scope, data.flag, data.value)
    },

    async entityUpdateHandler(data){
        if(!api.isMainGM()) return;
        let entity = await api.entityFromUuid(data.uuid);
        entity.update(data.newData, data.options)
    },

    async entityDeleteHandler(data){
        if(!api.isMainGM()) return;
        let entity = await api.entityFromUuid(data.uuid);
        entity.delete(data.options)
    }

}