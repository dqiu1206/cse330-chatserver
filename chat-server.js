// Require the packages we will use:
var http = require("http"),
socketio = require("socket.io"),
fs = require("fs");
var allRooms = [];
var allUsers = [];
//initializes room and pushes it into array
function createRoom(name,password,admin){
	var room = {
		roomName: name,
		roomPassword: password,
		roomAdmin: admin,
		roomUsers: [],
		roomBanned: [],
		roomMods: []
	};
	allRooms.push(room);
}
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	//runs when server receives public message from the client
	socket.on('message_to_server', function(data) {
		console.log("server message: "+data["message"]);
		console.log("server nickname: "+data["nickname"]);
		//emits only to the room that the message was sent from
		io.to(data['room']).emit('message_to_client', {message:data['message'],nickname:data['nickname']});
	});
	//runs when client creates a new chat room. Sends whether or not the room is created back to the clients
	socket.on('create_room_to_server', function(data) {
		console.log("room name: "+data["name"]);
		console.log("room pw: "+data["pw"]);
		console.log("room admin: "+data["admin"]);
		console.log(allRooms);
		var created = true;
		for(var i=0;i<allRooms.length;i++){
			if(created&&data['name']==allRooms[i].roomName){
				io.sockets.emit("create_room_to_client",{rooms:allRooms,created:"false",nickname:data['nickname']})
				created = false;
			}
		}
		if(created){
			createRoom(data['name'],data['pw'],data['admin']);
			io.sockets.emit("create_room_to_client",{rooms:allRooms,created:"true",nickname:data['nickname']})
		}
	});
	//runs when client creates a private message in a chat room
	socket.on('privatemessage_to_server', function(data) {
		//emits private message to the client
		io.to(data['room']).emit("privatemessage_to_client",{from:data['from'],to:data['to'],msg:data['msg']})
	});
	//runs when client wants to add a mod, updates array of chat rooms and updates the clients
	socket.on('addmod_to_server', function(data) {
		var add = true;
		for(var i=0;i<allRooms.length;i++){
			if(data['room']==allRooms[i].roomName){
				for(var j=0;j<allRooms[i].roomMods.length;j++){
					if(allRooms[i].roomMods[j]==data['mod']){
						add = false;
					}
				}
				if(add){
					allRooms[i].roomMods.push(data['mod']);
					io.sockets.emit("update_users_to_client",{rooms:allRooms,currentRoom:data['room']})
				}
			}
		}
	});
	//runs when client leaves a room. client socket leaves the room and is removed from array of users, then updates all clients
	socket.on('leaveroom_to_server', function(data) {
		socket.leave(data['room']);
		socket.room = null;
		for(var i=0;i<allRooms.length;i++){
			if(data['room']==allRooms[i].roomName){
				var index = allRooms[i].roomUsers.indexOf(data['nickname']);
				allRooms[i].roomUsers.splice(index,1);
			}
		}
		io.sockets.emit("update_users_to_client",{rooms:allRooms,currentRoom:data['room']})
	});
	//runs when user first logs in. sends the array of all chat rooms
	socket.on('get_rooms', function(data) {
		console.log("nickname: " + data['nick']);
		var create = true;
		for(var i = 0;i<allUsers.length;i++){
			if(allUsers[i]==data['nick']){
				io.sockets.emit("send_rooms",{rooms:allRooms, nickname:data['nick'],login:'false'})
				create =false;
			}
		}
		if(create){
			socket.username = data['nick'];
			allUsers.push(data['nick']);
			io.sockets.emit("send_rooms",{rooms:allRooms, nickname:data['nick'],login:'true'})
		}

	});
	//runs when an admin or mod kicks a user. emits whether or not the person was kicked
	socket.on('kickuser_to_server', function(data) {
		var found = false;
		for(var i=0;i<allRooms.length;i++){
			if(data['room']==allRooms[i].roomName){
				for(var j=0;j<allRooms[i].roomUsers.length;j++){
					if(data['kickUser']==allRooms[i].roomUsers[j]){
						io.sockets.emit("kickuser_to_client",{kicked:data['kickUser'],room:allRooms[i].roomName,found:"true",user:data['user']})
						found = true;
					}
				}
			}
		}
		if(!found){
			io.sockets.emit("kickuser_to_client",{kicked:data['kickUser'],found:"false",user:data['user']})
		}

	});
	//runs when admin or mod bans another user, emits whether or not the user was banned
	socket.on('banuser_to_server', function(data) {
		var found = false;
		var admin;
		for(var i=0;i<allRooms.length;i++){
			if(data['room']==allRooms[i].roomName){
				admin = allRooms[i].roomAdmin;
				for(var j=0;j<allRooms[i].roomUsers.length;j++){
					if(data['bannedUser']==allRooms[i].roomUsers[j] && admin != allRooms[i].roomUsers[j]){
						allRooms[i].roomBanned.push(data['bannedUser']);
						io.sockets.emit("banuser_to_client",{banned:data['bannedUser'],room:allRooms[i].roomName,found:"true",user:data['user']})
						found = true;
					}
				}
			}
		}
		if(!found){
			io.sockets.emit("banuser_to_client",{found:"false",user:data['user']})
		}

	});
	//runs when user is confirmed to join the room after entering password
	socket.on('user_joined_to_server', function(data) {
		console.log("user joined: " + data['nickname']);
		console.log("room joined: " + data['room']);
		for(var i=0;i<allRooms.length;i++){
			if(data['room']==allRooms[i].roomName){
				allRooms[i].roomUsers.push(data['nickname']);
			}
		}
		socket.join(data['room']);
		socket.room = data['room'];
		io.sockets.emit("update_users_to_client",{rooms:allRooms,currentRoom:data['room']})
		
	});
	//runs when client wants to join a join, emits the information on the room.
	socket.on('enter_room_to_server', function(data) {
		var banned = false;
		console.log("room id: " + data['room']);
		for (var i = 0; i < allRooms.length; i++){
			if (data['room'] == allRooms[i].roomName){
				for(var j=0;j<allRooms[i].roomBanned.length;j++){
					//emits if user is on the ban list
					if(allRooms[i].roomBanned[j]==data['nickname']){
						io.sockets.emit("join_room_to_client",{nickname:data['nickname'],banned:"true"})
						banned = true;
					}
				}
				if(!banned){
					//emits if room doesn't have a password
					if (allRooms[i].roomPassword.length==0) {
						io.sockets.emit("join_room_to_client",{room:data['room'],hasPassword:"false",nickname:data['nickname'],banned:"false"})
					}
					//emits if room has a password
					if(allRooms[i].roomPassword.length>0){
						io.sockets.emit("join_room_to_client",{room:data['room'],hasPassword:"true",password:allRooms[i].roomPassword, nickname:data['nickname'],banned:"false"})
					}
				}
				
			}
		}	
	});
	//removes user from room when user disconnects
	socket.on('disconnect', function () {
		for(var i=0;i<allRooms.length;i++){
			for(var j=0;j<allRooms[i].roomUsers.length;j++){
				if(socket.username==allRooms[i].roomUsers[j]){
					allRooms[i].roomUsers.splice(j,1);
					allUsers.splice(allUsers.indexOf(socket.username),1);
					io.sockets.emit("update_users_to_client",{rooms:allRooms, currentRoom:socket.room});
				}
			}
		}
	});
	
});