// Shared helper utilities dùng chung cho các handlers

function updateCounts(room) {
    room.state.onlineCount = room.state.players.size;
    room.state.queueCount = room.state.queue.length;
    room.state.partyCount = room.state.parties.size;
}

function getPlayerParty(room, sessionId) {
    const player = room.state.players.get(sessionId);
    if (!player || !player.partyId) return null;
    return room.state.parties.get(player.partyId) || null;
}

function removeFromQueue(room, sessionId) {
    const index = room.state.queue.findIndex(e => e.sessionId === sessionId);
    if (index !== -1) {
        room.state.queue.splice(index, 1);
        updateCounts(room);
    }
}

function removePlayerFromParty(room, sessionId) {
    const party = getPlayerParty(room, sessionId);
    if (!party) return;

    const memberIndex = party.members.findIndex(m => m.sessionId === sessionId);
    if (memberIndex !== -1) {
        party.members.splice(memberIndex, 1);
    }

    const player = room.state.players.get(sessionId);
    if (player) {
        player.status = "idle";
        player.partyId = "";
    }

    if (party.members.length === 0) {
        room.state.parties.delete(party.id);
        console.log(`🗑️ Party trống đã xoá: ${party.id}`);
    } else if (party.leaderId === sessionId) {
        const newLeader = party.members[0];
        party.leaderId = newLeader.sessionId;
        party.members.forEach(m => { m.isLeader = (m.sessionId === newLeader.sessionId); });

        const newLeaderClient = room.clients.find(c => c.sessionId === newLeader.sessionId);
        if (newLeaderClient) {
            newLeaderClient.send("leadershipTransferred", { message: "Bạn là leader mới!" });
        }
        console.log(`👑 Leadership → ${newLeader.username}`);
    }

    updateCounts(room);
}

function broadcastPartyUpdate(room, partyId) {
    const party = room.state.parties.get(partyId);
    if (!party) return;
    const data = serializeParty(party);
    party.members.forEach(member => {
        const client = room.clients.find(c => c.sessionId === member.sessionId);
        if (client) client.send("partyUpdate", data);
    });
}

function serializeParty(party) {
    return {
        id: party.id,
        inviteCode: party.inviteCode,
        leaderId: party.leaderId,
        members: party.members.map(m => ({
            sessionId: m.sessionId,
            username: m.username,
            isLeader: m.isLeader,
        })),
        status: party.status,
        maxMembers: party.maxMembers,
        createdAt: party.createdAt,
    };
}

function sendToClient(room, sessionId, type, data) {
    const client = room.clients.find(c => c.sessionId === sessionId);
    if (client) client.send(type, data);
}

module.exports = {
    updateCounts,
    getPlayerParty,
    removeFromQueue,
    removePlayerFromParty,
    broadcastPartyUpdate,
    serializeParty,
    sendToClient,
};
