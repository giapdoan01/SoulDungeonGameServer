const { Room } = require('colyseus');
const { MatchmakingState, MmPlayer, QueueEntry, Party, PartyMember } = require('../schema/MatchmakingState');
const { customAlphabet } = require('nanoid');

// Tạo invite code generator với 6 ký tự chữ hoa và số
const generateInviteCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

class MatchmakingRoom extends Room {
  onCreate(options) {
      console.log("🎮 MATCHMAKING ROOM CREATED:", this.roomId);
      
      this.setState(new MatchmakingState());
      this.maxClients = 100;
      
      this.setupMessageHandlers();
      
      this.cleanupTimer = setInterval(() => {
          this.cleanupOldParties();
      }, 60000); 
      
      this.matchmakingTimer = setInterval(() => {
          this.processMatchmaking();
      }, 5000); // Check every 1 second
      
      console.log("Matchmaking room ready with separate matchmaking timer");
  }

  onJoin(client, options) {
      console.log("\n========================================");
      console.log("👤 PLAYER JOINING:", client.sessionId);
      console.log("Options:", options);

      const player = new MmPlayer();
      player.sessionId = client.sessionId;
      player.username = options.username || options.name || "Player";
      player.level = options.level || 1;
      player.status = "idle";
      player.partyId = "";

      this.state.players.set(client.sessionId, player);
      this.updateCounts();

      client.send("welcome", {
          message: `Welcome ${player.username}!`,
          sessionId: client.sessionId
      });

      console.log(`✅ Player added! Total online: ${this.state.onlineCount}`);
      console.log("========================================\n");
  }

  onLeave(client, consented) {
      console.log(`👋 Player left: ${client.sessionId}`);
      
      // Remove from party
      this.removePlayerFromParty(client.sessionId);
      
      // Remove from queue
      this.removeFromQueue(client.sessionId);
      
      // Remove from players
      this.state.players.delete(client.sessionId);
      
      this.updateCounts();
  }

  setupMessageHandlers() {
      // ==================== QUEUE HANDLERS ====================
      
      // ✅ MODIFIED: Join Queue - CHỈ add vào queue, KHÔNG gọi tryMatchmaking
      this.onMessage("joinQueue", (client, data) => {
          console.log(`🎯 ${client.sessionId} joining queue`);
          
          const player = this.state.players.get(client.sessionId);
          if (!player) return;

          // Remove from party if in one
          this.removePlayerFromParty(client.sessionId);

          // Check if already in queue
          const existingIndex = this.state.queue.findIndex(
              entry => entry.sessionId === client.sessionId
          );
          
          if (existingIndex !== -1) {
              client.send("queueError", { message: "Already in queue" });
              return;
          }

          // Add to queue
          const queueEntry = new QueueEntry();
          queueEntry.sessionId = client.sessionId;
          queueEntry.username = player.username;
          queueEntry.level = player.level;
          queueEntry.joinedAt = Date.now();

          this.state.queue.push(queueEntry);
          player.status = "queue";
          player.partyId = "";
          
          this.updateCounts();

          // ✅ SEND queueJoined IMMEDIATELY - đảm bảo client nhận trước
          client.send("queueJoined", {
              position: this.state.queue.length,
              estimatedWait: this.state.queue.length * 5
          });

          console.log(`✅ Added to queue. Position: ${this.state.queue.length}`);
          
          // ❌ REMOVED: this.tryMatchmaking(); - Let timer handle it
      });

      // Leave Queue
      this.onMessage("leaveQueue", (client, data) => {
          console.log(`❌ ${client.sessionId} leaving queue`);
          
          this.removeFromQueue(client.sessionId);
          
          const player = this.state.players.get(client.sessionId);
          if (player) {
              player.status = "idle";
          }

          client.send("queueLeft", {});
      });

      // ==================== PARTY HANDLERS ====================

      // CREATE PARTY
      this.onMessage("createParty", (client, data) => {
          console.log(`🎉 ${client.sessionId} creating party`);
          
          const player = this.state.players.get(client.sessionId);
          if (!player) {
              client.send("partyError", { message: "Player not found" });
              return;
          }

          // Remove from existing party/queue
          this.removePlayerFromParty(client.sessionId);
          this.removeFromQueue(client.sessionId);

          // Create new party
          const partyId = `party_${Date.now()}_${client.sessionId.substring(0, 5)}`;
          const inviteCode = generateInviteCode();
          
          const party = new Party();
          party.id = partyId;
          party.inviteCode = inviteCode;
          party.leaderId = client.sessionId;
          party.createdAt = Date.now();
          party.status = "waiting";
          party.maxMembers = data.maxMembers || 4;

          // Add host as leader using PartyMember schema
          const leaderMember = new PartyMember();
          leaderMember.sessionId = client.sessionId;
          leaderMember.username = player.username;
          leaderMember.level = player.level;
          leaderMember.isLeader = true;
          
          party.members.push(leaderMember);
          this.state.parties.set(partyId, party);

          // Update player
          player.status = "party";
          player.partyId = partyId;

          this.updateCounts();

          client.send("partyCreated", {
              success: true,
              partyId: partyId,
              inviteCode: inviteCode,
              party: this.serializeParty(party)
          });

          console.log(`✅ Party created: ${partyId} with code: ${inviteCode}`);
      });

      // JOIN PARTY BY CODE
      this.onMessage("joinPartyByCode", (client, data) => {
          console.log(`🎯 ${client.sessionId} joining party: ${data.inviteCode}`);
          
          const player = this.state.players.get(client.sessionId);
          if (!player) {
              client.send("joinPartyResult", { success: false, reason: "PLAYER_NOT_FOUND" });
              return;
          }

          // Find party by invite code
          let foundParty = null;
          let foundPartyId = null;
          
          this.state.parties.forEach((party, partyId) => {
              if (party.inviteCode === data.inviteCode) {
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

          // Check if already in this party
          const alreadyInParty = foundParty.members.find(m => m.sessionId === client.sessionId);
          if (alreadyInParty) {
              client.send("joinPartyResult", { success: false, reason: "ALREADY_IN_PARTY" });
              return;
          }

          // Remove from existing party/queue
          this.removePlayerFromParty(client.sessionId);
          this.removeFromQueue(client.sessionId);

          // Add to party using PartyMember schema
          const member = new PartyMember();
          member.sessionId = client.sessionId;
          member.username = player.username;
          member.level = player.level;
          member.isLeader = false;
          
          foundParty.members.push(member);

          // Update player
          player.status = "party";
          player.partyId = foundPartyId;

          this.updateCounts();

          // Send success to joiner
          client.send("joinPartyResult", { 
              success: true, 
              party: this.serializeParty(foundParty)
          });

          // Broadcast party update to all members
          this.broadcastPartyUpdate(foundPartyId);

          console.log(`✅ Player joined party ${foundPartyId}. Members: ${foundParty.members.length}`);
      });

      // LEAVE PARTY
      this.onMessage("leaveParty", (client, data) => {
          console.log(`👋 ${client.sessionId} leaving party`);
          
          const party = this.getPlayerParty(client.sessionId);
          if (!party) {
              client.send("partyError", { message: "Not in a party" });
              return;
          }

          const partyId = party.id;
          this.removePlayerFromParty(client.sessionId);
          
          client.send("partyLeft", { success: true });
          
          // Broadcast update to remaining members
          if (this.state.parties.has(partyId)) {
              this.broadcastPartyUpdate(partyId);
          }
      });

      // KICK PLAYER (Leader only)
      this.onMessage("kickPlayer", (client, data) => {
          console.log(`👢 ${client.sessionId} kicking ${data.sessionId}`);
          
          const party = this.getPlayerParty(client.sessionId);
          if (!party) return;

          if (party.leaderId !== client.sessionId) {
              client.send("kickResult", { success: false, reason: "NOT_LEADER" });
              return;
          }

          if (data.sessionId === client.sessionId) {
              client.send("kickResult", { success: false, reason: "CANNOT_KICK_SELF" });
              return;
          }

          const targetMember = party.members.find(m => m.sessionId === data.sessionId);
          if (!targetMember) {
              client.send("kickResult", { success: false, reason: "PLAYER_NOT_IN_PARTY" });
              return;
          }

          // Remove player from party
          this.removePlayerFromParty(data.sessionId);

          // Notify kicked player
          const kickedClient = this.clients.find(c => c.sessionId === data.sessionId);
          if (kickedClient) {
              kickedClient.send("kicked", { reason: "KICKED_BY_LEADER" });
          }

          client.send("kickResult", { success: true });
          this.broadcastPartyUpdate(party.id);

          console.log(`✅ Player ${data.sessionId} kicked from party`);
      });

      // START MATCH
      this.onMessage("startPartyMatch", async (client, data) => {
          console.log(`🚀 ${client.sessionId} starting party match`);
          
          const party = this.getPlayerParty(client.sessionId);
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

          // Update party status
          party.status = "starting";
          this.broadcastPartyUpdate(party.id);

          try {
              // Create GameRoom
              const gameRoomId = `game_${Date.now()}_${party.id}`;
              
              // Send match found to all party members
              const matchData = {
                  gameRoomId: gameRoomId,
                  partyId: party.id,
                  inviteCode: party.inviteCode,
                  members: party.members.map(m => ({
                      sessionId: m.sessionId,
                      username: m.username,
                      level: m.level,
                      isLeader: m.isLeader
                  })),
                  isPartyMatch: true
              };

              party.members.forEach(member => {
                  const memberClient = this.clients.find(c => c.sessionId === member.sessionId);
                  if (memberClient) {
                      memberClient.send("matchFound", matchData);
                      
                      // Update member status
                      const playerState = this.state.players.get(member.sessionId);
                      if (playerState) {
                          playerState.status = "matched";
                      }
                  }
              });

              // Update party status
              party.status = "in_game";
              this.updateCounts();

              client.send("startMatchResult", { success: true, gameRoomId: gameRoomId });

              console.log(`✅ Match started for party ${party.id} with ${party.members.length} players`);

          } catch (error) {
              console.error("Error starting match:", error);
              party.status = "waiting";
              this.broadcastPartyUpdate(party.id);
              client.send("startMatchResult", { success: false, reason: "SERVER_ERROR" });
          }
      });

      // Update Status
      this.onMessage("updateStatus", (client, data) => {
          const player = this.state.players.get(client.sessionId);
          if (player && data.status) {
              player.status = data.status;
              console.log(`📝 ${client.sessionId} status: ${data.status}`);
          }
      });
  }

  // ==================== MATCHMAKING METHODS ====================

  // ✅ NEW: Separate matchmaking processor - chạy bằng timer
  processMatchmaking() {
      if (this.state.queue.length >= 2) {
          console.log(`🔍 Processing matchmaking for ${this.state.queue.length} players`);
          this.createMatch();
      }
  }

  // ✅ RENAMED: tryMatchmaking → createMatch
  createMatch() {
      const player1Entry = this.state.queue[0];
      const player2Entry = this.state.queue[1];

      const player1 = this.state.players.get(player1Entry.sessionId);
      const player2 = this.state.players.get(player2Entry.sessionId);

      if (player1 && player2) {
          console.log("\n🎮 QUEUE MATCH FOUND!");
          console.log(`   Player 1: ${player1.username} (Lv.${player1.level})`);
          console.log(`   Player 2: ${player2.username} (Lv.${player2.level})`);

          const gameRoomId = `game_${Date.now()}_queue`;

          // Send match found to both players
          const matchData = {
              gameRoomId: gameRoomId,
              members: [
                  { sessionId: player1.sessionId, username: player1.username, level: player1.level },
                  { sessionId: player2.sessionId, username: player2.username, level: player2.level }
              ],
              isPartyMatch: false
          };

          this.clients.forEach(client => {
              if (client.sessionId === player1Entry.sessionId) {
                  client.send("matchFound", {
                      ...matchData,
                      opponent: {
                          username: player2.username,
                          level: player2.level
                      }
                  });
              } else if (client.sessionId === player2Entry.sessionId) {
                  client.send("matchFound", {
                      ...matchData,
                      opponent: {
                          username: player1.username,
                          level: player1.level
                      }
                  });
              }
          });

          // Remove both from queue
          this.state.queue.splice(0, 2);
          
          // Update status
          player1.status = "matched";
          player2.status = "matched";

          this.updateCounts();
      }
  }

  // ==================== HELPER METHODS ====================

  getPlayerParty(sessionId) {
      const player = this.state.players.get(sessionId);
      if (!player || !player.partyId) return null; 
      return this.state.parties.get(player.partyId);
  }

  removePlayerFromParty(sessionId) {
      const party = this.getPlayerParty(sessionId);
      if (!party) return;

      // Remove player from party members
      const memberIndex = party.members.findIndex(m => m.sessionId === sessionId);
      if (memberIndex !== -1) {
          party.members.splice(memberIndex, 1);
      }

      // Update player status
      const player = this.state.players.get(sessionId);
      if (player) {
          player.status = "idle";
          player.partyId = ""; 
      }

      // If party is empty, remove it
      if (party.members.length === 0) {
          this.state.parties.delete(party.id);
          console.log(`🗑️ Empty party removed: ${party.id}`);
      } 
      // If leader left, transfer leadership to next member
      else if (party.leaderId === sessionId && party.members.length > 0) {
          const newLeader = party.members[0];
          party.leaderId = newLeader.sessionId;
          newLeader.isLeader = true;
          
          // Set isLeader flag for all members
          party.members.forEach(member => {
              member.isLeader = (member.sessionId === newLeader.sessionId);
          });
          
          console.log(`👑 Leadership transferred to: ${newLeader.username}`);
          
          // Notify new leader
          const newLeaderClient = this.clients.find(c => c.sessionId === newLeader.sessionId);
          if (newLeaderClient) {
              newLeaderClient.send("leadershipTransferred", { 
                  message: "You are now the party leader!" 
              });
          }
      }

      this.updateCounts();
  }

  removeFromQueue(sessionId) {
      const index = this.state.queue.findIndex(
          entry => entry.sessionId === sessionId
      );
      
      if (index !== -1) {
          this.state.queue.splice(index, 1);
          this.updateCounts();
          console.log(`🗑️ Removed from queue: ${sessionId}`);
      }
  }

  broadcastPartyUpdate(partyId) {
      const party = this.state.parties.get(partyId);
      if (!party) return;

      const partyData = this.serializeParty(party);

      party.members.forEach(member => {
          const client = this.clients.find(c => c.sessionId === member.sessionId);
          if (client) {
              client.send("partyUpdate", partyData);
          }
      });
  }

  serializeParty(party) {
      return {
          id: party.id,
          inviteCode: party.inviteCode,
          leaderId: party.leaderId,
          members: party.members.map(m => ({
              sessionId: m.sessionId,
              username: m.username,
              level: m.level,
              isLeader: m.isLeader
          })),
          status: party.status, 
          maxMembers: party.maxMembers,
          createdAt: party.createdAt
      };
  }

  cleanupOldParties() {
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes

      const partiesToRemove = [];
      
      this.state.parties.forEach((party, partyId) => {
          if (now - party.createdAt > maxAge && party.status === "waiting") {
              partiesToRemove.push(partyId);
          }
      });

      partiesToRemove.forEach(partyId => {
          const party = this.state.parties.get(partyId);
          if (party) {
              // Notify all members
              party.members.forEach(member => {
                  const client = this.clients.find(c => c.sessionId === member.sessionId);
                  if (client) {
                      client.send("partyExpired", { 
                          message: "Party expired due to inactivity" 
                      });
                  }
                  
                  // Reset player status
                  const player = this.state.players.get(member.sessionId);
                  if (player) {
                      player.status = "idle";
                      player.partyId = "";
                  }
              });

              this.state.parties.delete(partyId);
              console.log(`🕐 Expired party removed: ${partyId}`);
          }
      });

      if (partiesToRemove.length > 0) {
          this.updateCounts();
      }
  }

  updateCounts() {
      this.state.onlineCount = this.state.players.size;
      this.state.queueCount = this.state.queue.length;
      this.state.partyCount = this.state.parties.size;
  }

  onDispose() {
      console.log("🛑 Matchmaking room disposed");
      
      if (this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
      }
      
      // ✅ CLEAR matchmaking timer
      if (this.matchmakingTimer) {
          clearInterval(this.matchmakingTimer);
      }
  }
}

module.exports = MatchmakingRoom;
