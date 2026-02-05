const { Schema, MapSchema, ArraySchema, type } = require('@colyseus/schema');

// ==================== QueueEntry ====================
class QueueEntry extends Schema {
  constructor() {
      super();
      this.sessionId = "";
      this.username = "";
      this.level = 1;
      this.joinedAt = 0;
  }
}

type("string")(QueueEntry.prototype, "sessionId");
type("string")(QueueEntry.prototype, "username");
type("number")(QueueEntry.prototype, "level");
type("float64")(QueueEntry.prototype, "joinedAt");

// ==================== MmPlayer ====================
class MmPlayer extends Schema {
  constructor() {
      super();
      this.sessionId = "";
      this.username = "";
      this.level = 1;
      this.status = "idle"; // "idle" | "queue" | "party" | "matched"
      this.partyId = ""; // ✅ ĐỒNG BỘ với Unity (đổi từ partyCode)
  }
}

type("string")(MmPlayer.prototype, "sessionId");
type("string")(MmPlayer.prototype, "username");
type("number")(MmPlayer.prototype, "level");
type("string")(MmPlayer.prototype, "status");
type("string")(MmPlayer.prototype, "partyId"); // ✅ ĐỒNG BỘ

// ==================== PartyMember ====================
class PartyMember extends Schema {
  constructor() {
      super();
      this.sessionId = "";
      this.username = "";
      this.level = 1;
      this.isLeader = false;
  }
}

type("string")(PartyMember.prototype, "sessionId");
type("string")(PartyMember.prototype, "username");
type("number")(PartyMember.prototype, "level");
type("boolean")(PartyMember.prototype, "isLeader");

// ==================== Party ====================
class Party extends Schema {
  constructor() {
      super();
      this.id = "";
      this.inviteCode = "";
      this.leaderId = "";
      this.members = new ArraySchema();
      this.createdAt = 0;
      this.status = "waiting"; // ✅ THÊM - "waiting" | "starting" | "in_game"
      this.maxMembers = 2; 
  }
}

type("string")(Party.prototype, "id");
type("string")(Party.prototype, "inviteCode");
type("string")(Party.prototype, "leaderId");
type([PartyMember])(Party.prototype, "members");
type("float64")(Party.prototype, "createdAt");
type("string")(Party.prototype, "status"); 
type("number")(Party.prototype, "maxMembers"); 

// ==================== MatchmakingState ====================
class MatchmakingState extends Schema {
  constructor() {
      super();
      this.players = new MapSchema();
      this.queue = new ArraySchema();
      this.parties = new MapSchema();
      this.onlineCount = 0;
      this.queueCount = 0;
      this.partyCount = 0;
  }
}

type({ map: MmPlayer })(MatchmakingState.prototype, "players");
type([QueueEntry])(MatchmakingState.prototype, "queue");
type({ map: Party })(MatchmakingState.prototype, "parties");
type("number")(MatchmakingState.prototype, "onlineCount");
type("number")(MatchmakingState.prototype, "queueCount");
type("number")(MatchmakingState.prototype, "partyCount");

module.exports = { MatchmakingState, MmPlayer, QueueEntry, Party, PartyMember };