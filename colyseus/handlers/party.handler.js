const { customAlphabet } = require('nanoid');
const { Party, PartyMember } = require('../schema/MatchmakingState');
const {
    getPlayerParty,
    removePlayerFromParty,
    removeFromQueue,
    broadcastPartyUpdate,
    serializeParty,
    updateCounts,
} = require('../utils/matchmaking.utils');
const MatchHandler = require('./match.handler');

const generateInviteCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

class PartyHandler {

    static handleCreateParty(room, client, data) {
        const player = room.state.players.get(client.sessionId);
        if (!player) {
            client.send("partyError", { message: "Player không tồn tại" });
            return;
        }

        // Rời party/queue cũ
        removePlayerFromParty(room, client.sessionId);
        removeFromQueue(room, client.sessionId);

        const partyId = `party_${Date.now()}_${client.sessionId.substring(0, 5)}`;
        const inviteCode = generateInviteCode();

        const party = new Party();
        party.id = partyId;
        party.inviteCode = inviteCode;
        party.leaderId = client.sessionId;
        party.createdAt = Date.now();
        party.status = "waiting";
        party.maxMembers = data?.maxMembers || 2;

        const leader = new PartyMember();
        leader.sessionId = client.sessionId;
        leader.username = player.username;
        leader.isLeader = true;
        party.members.push(leader);

        room.state.parties.set(partyId, party);
        player.status = "party";
        player.partyId = partyId;
        updateCounts(room);

        client.send("partyCreated", {
            success: true,
            partyId,
            inviteCode,
            party: serializeParty(party),
        });

        console.log(`🎉 Party tạo: ${partyId} | Code: ${inviteCode}`);
    }

    static handleJoinPartyByCode(room, client, data) {
        const player = room.state.players.get(client.sessionId);
        if (!player) {
            client.send("joinPartyResult", { success: false, reason: "PLAYER_NOT_FOUND" });
            return;
        }

        // Tìm party theo invite code
        let foundParty = null;
        let foundPartyId = null;
        room.state.parties.forEach((party, partyId) => {
            if (party.inviteCode === data?.inviteCode) {
                foundParty = party;
                foundPartyId = partyId;
            }
        });

        if (!foundParty) {
            client.send("joinPartyResult", { success: false, reason: "PARTY_NOT_FOUND" });
            return;
        }
        if (foundParty.status !== "waiting") {
            client.send("joinPartyResult", { success: false, reason: "PARTY_NOT_AVAILABLE" });
            return;
        }
        if (foundParty.members.length >= foundParty.maxMembers) {
            client.send("joinPartyResult", { success: false, reason: "PARTY_FULL" });
            return;
        }
        if (foundParty.members.some(m => m.sessionId === client.sessionId)) {
            client.send("joinPartyResult", { success: false, reason: "ALREADY_IN_PARTY" });
            return;
        }

        removePlayerFromParty(room, client.sessionId);
        removeFromQueue(room, client.sessionId);

        const member = new PartyMember();
        member.sessionId = client.sessionId;
        member.username = player.username;
        member.isLeader = false;
        foundParty.members.push(member);

        player.status = "party";
        player.partyId = foundPartyId;
        updateCounts(room);

        client.send("joinPartyResult", {
            success: true,
            party: serializeParty(foundParty),
        });
        broadcastPartyUpdate(room, foundPartyId);

        console.log(`✅ ${player.username} vào party ${foundPartyId}. Members: ${foundParty.members.length}`);
    }

    static handleLeaveParty(room, client) {
        const party = getPlayerParty(room, client.sessionId);
        if (!party) {
            client.send("partyError", { message: "Bạn không trong party nào" });
            return;
        }

        const partyId = party.id;
        removePlayerFromParty(room, client.sessionId);
        client.send("partyLeft", { success: true });

        if (room.state.parties.has(partyId)) {
            broadcastPartyUpdate(room, partyId);
        }
    }

    static handleKickPlayer(room, client, data) {
        const party = getPlayerParty(room, client.sessionId);
        if (!party) return;

        if (party.leaderId !== client.sessionId) {
            client.send("kickResult", { success: false, reason: "NOT_LEADER" });
            return;
        }
        if (data?.sessionId === client.sessionId) {
            client.send("kickResult", { success: false, reason: "CANNOT_KICK_SELF" });
            return;
        }
        if (!party.members.some(m => m.sessionId === data?.sessionId)) {
            client.send("kickResult", { success: false, reason: "PLAYER_NOT_IN_PARTY" });
            return;
        }

        removePlayerFromParty(room, data.sessionId);

        const kickedClient = room.clients.find(c => c.sessionId === data.sessionId);
        if (kickedClient) kickedClient.send("kicked", { reason: "KICKED_BY_LEADER" });

        client.send("kickResult", { success: true });
        broadcastPartyUpdate(room, party.id);

        console.log(`👢 ${data.sessionId} bị kick khỏi party`);
    }

    static handleStartPartyMatch(room, client) {
        const party = getPlayerParty(room, client.sessionId);
        if (!party) {
            client.send("startMatchResult", { success: false, reason: "NOT_IN_PARTY" });
            return;
        }
        if (party.leaderId !== client.sessionId) {
            client.send("startMatchResult", { success: false, reason: "NOT_LEADER" });
            return;
        }
        if (party.status !== "waiting") {
            client.send("startMatchResult", { success: false, reason: "PARTY_NOT_READY" });
            return;
        }
        if (party.members.length < 2) {
            client.send("startMatchResult", { success: false, reason: "NOT_ENOUGH_PLAYERS" });
            return;
        }

        party.status = "starting";
        broadcastPartyUpdate(room, party.id);

        const players = party.members.map(m => ({
            sessionId: m.sessionId,
            username: m.username,
        }));

        client.send("startMatchResult", { success: true });

        // Bắt đầu countdown 15s
        MatchHandler.createPendingMatch(room, players, true, party.id);

        console.log(`🚀 Party ${party.id} bắt đầu tìm trận với ${players.length} người`);
    }

    static cleanupOldParties(room) {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000;

        room.state.parties.forEach((party, partyId) => {
            if (now - party.createdAt > maxAge && party.status === "waiting") {
                party.members.forEach(member => {
                    const client = room.clients.find(c => c.sessionId === member.sessionId);
                    if (client) client.send("partyExpired", { message: "Party hết hạn do không hoạt động" });

                    const player = room.state.players.get(member.sessionId);
                    if (player) { player.status = "idle"; player.partyId = ""; }
                });
                room.state.parties.delete(partyId);
                console.log(`🕐 Party hết hạn xoá: ${partyId}`);
            }
        });

        updateCounts(room);
    }
}

module.exports = PartyHandler;
