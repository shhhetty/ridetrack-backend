from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, JWTManager, jwt_required, get_jwt_identity
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, send
import os

basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)

# --- CONFIGURATIONS ---
app.config['JWT_SECRET_KEY'] = 'a-super-secret-key-that-no-one-should-guess'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'ridetrack.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- INITIALIZATIONS ---
FRONTEND_ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"]

CORS(app, resources={r"/*": {"origins": FRONTEND_ORIGINS}}, supports_credentials=True)
db = SQLAlchemy(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins=FRONTEND_ORIGINS)

# --- DATABASE MODELS ---
group_members = db.Table('group_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('group_id', db.Integer, db.ForeignKey('group.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    city = db.Column(db.String(100))
    bike_model = db.Column(db.String(100), nullable=True)
    bio = db.Column(db.Text, nullable=True)
    riding_style = db.Column(db.String(100), nullable=True)
    created_groups = db.relationship('Group', backref='creator', lazy=True)
    joined_groups = db.relationship('Group', secondary=group_members, backref='members', lazy='dynamic')

    def __repr__(self):
        return f'<User {self.username}>'

class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def __repr__(self):
        return f'<Group {self.name}>'

class Connection(db.Model):
    requester_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    status = db.Column(db.String(20), nullable=False, default='pending')

    def __repr__(self):
        return f'<Connection from {self.requester_id} to {self.receiver_id}: {self.status}>'

class RideSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False, default=db.func.now())
    end_time = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    group = db.relationship('Group', backref='ride_sessions')

    def __repr__(self):
        return f'<RideSession for Group {self.group_id}, Active: {self.is_active}>'

# --- HTTP ROUTES ---
@app.route('/')
def home():
    return "Welcome to RideTrack! Database is set up."

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({"error": "Missing required fields"}), 400
    if User.query.filter_by(email=data.get('email')).first() or User.query.filter_by(username=data.get('username')).first():
        return jsonify({"error": "Email or username already in use"}), 409
    hashed_password = generate_password_hash(data.get('password'), method='pbkdf2:sha256')
    new_user = User(username=data.get('username'), email=data.get('email'), password_hash=hashed_password, city=data.get('city'))
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"message": "User created successfully!"}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({"error": "Missing email or password"}), 400
    user = User.query.filter_by(email=data.get('email')).first()
    if user and check_password_hash(user.password_hash, data.get('password')):
        access_token = create_access_token(identity=str(user.id))
        return jsonify(access_token=access_token), 200
    return jsonify({"error": "Invalid email or password"}), 401

@app.route('/profile', methods=['GET'])
@jwt_required()
def profile():
    current_user_id = get_jwt_identity()
    user = db.session.get(User, current_user_id)
    if not user: return jsonify({"error": "User not found"}), 404
    joined_groups_ids = [group.id for group in user.joined_groups]
    user_data = {
        "id": user.id, "username": user.username, "email": user.email, "city": user.city,
        "bike_model": user.bike_model, "bio": user.bio, "riding_style": user.riding_style,
        "joined_groups": joined_groups_ids
    }
    return jsonify(user_data), 200

@app.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    current_user_id = get_jwt_identity()
    user = db.session.get(User, current_user_id)
    if not user: return jsonify({"error": "User not found"}), 404
    data = request.get_json()
    user.city = data.get('city', user.city)
    user.bike_model = data.get('bike_model', user.bike_model)
    user.bio = data.get('bio', user.bio)
    user.riding_style = data.get('riding_style', user.riding_style)
    db.session.commit()
    return jsonify({"message": "Profile updated successfully"}), 200

@app.route('/groups', methods=['POST'])
@jwt_required()
def create_group():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    if not data or not data.get('name'): return jsonify({"error": "Group name is required"}), 400
    new_group = Group(name=data.get('name'), description=data.get('description'), creator_id=current_user_id)
    db.session.add(new_group)
    db.session.commit()
    return jsonify({"message": f"Group '{new_group.name}' created successfully!"}), 201

@app.route('/groups', methods=['GET'])
def get_all_groups():
    groups = Group.query.all()
    groups_list = [{"id": g.id, "name": g.name, "description": g.description, "creator_username": g.creator.username if g.creator else "Unknown"} for g in groups]
    return jsonify(groups_list), 200

@app.route('/groups/<int:group_id>', methods=['GET'])
def get_group_details(group_id):
    group = db.session.get(Group, group_id)
    if not group: return jsonify({"error": "Group not found"}), 404
    active_ride = RideSession.query.filter_by(group_id=group_id, is_active=True).first()
    members_list = [{"id": u.id, "username": u.username} for u in group.members]
    group_data = {
        "id": group.id, "name": group.name, "description": group.description,
        "creator_username": group.creator.username if group.creator else "Unknown",
        "members": members_list, "active_ride_id": active_ride.id if active_ride else None
    }
    return jsonify(group_data), 200

@app.route('/groups/<int:group_id>/join', methods=['POST'])
@jwt_required()
def join_group(group_id):
    current_user_id = get_jwt_identity()
    user = db.session.get(User, current_user_id)
    group = db.session.get(Group, group_id)
    if not group: return jsonify({"error": "Group not found"}), 404
    if user in group.members: return jsonify({"message": "You are already a member of this group"}), 200
    group.members.append(user)
    db.session.commit()
    return jsonify({"message": f"Successfully joined group '{group.name}'"}), 200

@app.route('/groups/<int:group_id>/leave', methods=['POST'])
@jwt_required()
def leave_group(group_id):
    current_user_id = get_jwt_identity()
    user = db.session.get(User, current_user_id)
    group = db.session.get(Group, group_id)
    if not group: return jsonify({"error": "Group not found"}), 404
    if user not in group.members: return jsonify({"error": "You are not a member of this group"}), 400
    group.members.remove(user)
    db.session.commit()
    return jsonify({"message": f"Successfully left group '{group.name}'"}), 200

@app.route('/users', methods=['GET'])
@jwt_required()
def get_all_users():
    current_user_id = int(get_jwt_identity())
    user_connections = Connection.query.filter((Connection.requester_id == current_user_id) | (Connection.receiver_id == current_user_id)).all()
    connection_status_map = {}
    for conn in user_connections:
        other_user_id = conn.receiver_id if conn.requester_id == current_user_id else conn.requester_id
        if conn.status == 'pending':
            status = 'sent' if conn.requester_id == current_user_id else 'received'
            connection_status_map[other_user_id] = status
        else:
            connection_status_map[other_user_id] = conn.status
    users = User.query.filter(User.id != current_user_id).all()
    users_list = [{"id": u.id, "username": u.username, "city": u.city, "bike_model": u.bike_model, "connection_status": connection_status_map.get(u.id, 'none')} for u in users]
    return jsonify(users_list), 200

@app.route('/connections/send/<int:receiver_id>', methods=['POST'])
@jwt_required()
def send_connection_request(receiver_id):
    requester_id = int(get_jwt_identity())
    if requester_id == receiver_id: return jsonify({"error": "You cannot connect with yourself."}), 400
    existing_connection = Connection.query.filter(((Connection.requester_id == requester_id) & (Connection.receiver_id == receiver_id)) | ((Connection.requester_id == receiver_id) & (Connection.receiver_id == requester_id))).first()
    if existing_connection: return jsonify({"error": "A connection or pending request already exists with this user."}), 409
    new_connection = Connection(requester_id=requester_id, receiver_id=receiver_id, status='pending')
    db.session.add(new_connection)
    db.session.commit()
    return jsonify({"message": "Connection request sent."}), 201

@app.route('/connections/accept/<int:requester_id>', methods=['POST'])
@jwt_required()
def accept_connection_request(requester_id):
    receiver_id = int(get_jwt_identity())
    connection_request = Connection.query.filter_by(requester_id=requester_id, receiver_id=receiver_id, status='pending').first()
    if not connection_request: return jsonify({"error": "No pending request found from this user."}), 404
    connection_request.status = 'accepted'
    db.session.commit()
    return jsonify({"message": "Connection request accepted."}), 200

@app.route('/connections', methods=['GET'])
@jwt_required()
def get_connections():
    current_user_id = int(get_jwt_identity())
    accepted_connections_query = Connection.query.filter((Connection.status == 'accepted') & ((Connection.requester_id == current_user_id) | (Connection.receiver_id == current_user_id))).all()
    connections = []
    for conn in accepted_connections_query:
        friend_id = conn.receiver_id if conn.requester_id == current_user_id else conn.requester_id
        friend = db.session.get(User, friend_id)
        if friend: connections.append({"id": friend.id, "username": friend.username})
    sent_requests_query = Connection.query.filter_by(requester_id=current_user_id, status='pending').all()
    sent_requests = []
    for req in sent_requests_query:
        receiver = db.session.get(User, req.receiver_id)
        if receiver: sent_requests.append({"id": receiver.id, "username": receiver.username})
    received_requests_query = Connection.query.filter_by(receiver_id=current_user_id, status='pending').all()
    received_requests = []
    for req in received_requests_query:
        requester = db.session.get(User, req.requester_id)
        if requester: received_requests.append({"id": requester.id, "username": requester.username})
    return jsonify({"connections": connections, "sent_requests": sent_requests, "received_requests": received_requests}), 200

@app.route('/groups/<int:group_id>/start_ride', methods=['POST'])
@jwt_required()
def start_ride(group_id):
    current_user_id = int(get_jwt_identity())
    group = db.session.get(Group, group_id)
    if not group: return jsonify({"error": "Group not found"}), 404
    if group.creator_id != current_user_id: return jsonify({"error": "Only the group creator can start a ride."}), 403
    active_ride = RideSession.query.filter_by(group_id=group_id, is_active=True).first()
    if active_ride: return jsonify({"error": "A ride is already active for this group."}), 409
    new_ride = RideSession(group_id=group_id)
    db.session.add(new_ride)
    db.session.commit()
    return jsonify({"message": "Ride started successfully!", "ride_id": new_ride.id}), 201

@app.route('/groups/<int:group_id>/end_ride', methods=['POST'])
@jwt_required()
def end_ride(group_id):
    current_user_id = int(get_jwt_identity())
    group = db.session.get(Group, group_id)
    if not group: return jsonify({"error": "Group not found"}), 404
    if group.creator_id != current_user_id: return jsonify({"error": "Only the group creator can end a ride."}), 403
    active_ride = RideSession.query.filter_by(group_id=group_id, is_active=True).first()
    if not active_ride: return jsonify({"error": "No active ride found for this group."}), 404
    active_ride.is_active = False
    active_ride.end_time = db.func.now()
    db.session.commit()
    return jsonify({"message": "Ride ended successfully."}), 200

# --- SOCKET.IO EVENTS ---
@socketio.on('connect')
def handle_connect():
    print('Client connected!')

@socketio.on('join')
def handle_join(data):
    username = data.get('username')
    room = data.get('room')
    if not username or not room: return
    join_room(room)
    send({"msg": f"{username} has joined the chat."}, to=room)
    print(f"{username} has joined room {room}")

@socketio.on('message')
def handle_message(data):
    room = data.get('room')
    msg = data.get('msg')
    username = data.get('username')
    if not room or not msg or not username: return
    send({"msg": msg, "username": username}, to=room)
    print(f"Message from {username} in room {room}: {msg}")

if __name__ == '__main__':
    socketio.run(app, debug=True)