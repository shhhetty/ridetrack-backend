document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    let currentRoom = null;
    let map = null;
    let userMarkers = {};

    // --- SELECTING HTML ELEMENTS ---
    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');
    const updateProfileForm = document.getElementById('update-profile-form');
    const authContainer = document.getElementById('auth-container');
    const profileContainer = document.getElementById('profile-container');
    const profileDetails = document.getElementById('profile-details');
    const groupsContainer = document.getElementById('groups-container');
    const createGroupForm = document.getElementById('create-group-form');
    const groupsList = document.getElementById('groups-list');
    const navLinksLoggedIn = document.getElementById('nav-links-logged-in');
    const profileLink = document.getElementById('profile-link');
    const groupsLink = document.getElementById('groups-link');
    const navbarLogoutButton = document.getElementById('navbar-logout-button');
    const ridersContainer = document.getElementById('riders-container');
    const ridersList = document.getElementById('riders-list');
    const ridersLink = document.getElementById('riders-link');
    const connectionsContainer = document.getElementById('connections-container');
    const connectionsLink = document.getElementById('connections-link');
    const receivedRequestsList = document.getElementById('received-requests-list');
    const currentConnectionsList = document.getElementById('current-connections-list');
    const sentRequestsList = document.getElementById('sent-requests-list');
    const singleGroupContainer = document.getElementById('single-group-container');
    const backToGroupsButton = document.getElementById('back-to-groups-button');
    const singleGroupName = document.getElementById('single-group-name');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatMessageInput = document.getElementById('chat-message-input');
    const singleGroupDescription = document.getElementById('single-group-description');
    const singleGroupMembers = document.getElementById('single-group-members');
    const mapContainer = document.getElementById('map-container');
    const rideGroupName = document.getElementById('ride-group-name');
    const leaveRideButton = document.getElementById('leave-ride-button');
    const mapElement = document.getElementById('map');
    const rideActions = document.getElementById('ride-actions');

    const API_URL = 'http://127.0.0.1:5000';
    const socket = io(API_URL);

    // --- SOCKET.IO EVENT LISTENERS ---
    socket.on('message', (data) => {
        const div = document.createElement('div');
        if (data.username) {
            div.innerHTML = `<strong>${data.username}:</strong> ${data.msg}`;
        } else {
            div.innerHTML = `<small class="text-muted">${data.msg}</small>`;
        }
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // --- VIEW AND DATA FUNCTIONS ---
    function showView(viewId) {
        authContainer.style.display = 'none';
        profileContainer.style.display = 'none';
        groupsContainer.style.display = 'none';
        ridersContainer.style.display = 'none';
        connectionsContainer.style.display = 'none';
        singleGroupContainer.style.display = 'none';
        mapContainer.style.display = 'none';
        const viewToShow = document.getElementById(viewId);
        if (viewToShow) {
            viewToShow.style.display = 'block';
        }
    }

    async function showProfileView() {
        authContainer.style.display = 'none';
        navLinksLoggedIn.style.display = 'flex';
        showView('profile-container');
        const user = await fetchProfile();
        if (user) {
            fetchAllGroups(user);
        }
    }

    function showAuthView() {
        authContainer.style.display = 'block';
        navLinksLoggedIn.style.display = 'none';
        profileContainer.style.display = 'none';
        groupsContainer.style.display = 'none';
        ridersContainer.style.display = 'none';
        connectionsContainer.style.display = 'none';
        singleGroupContainer.style.display = 'none';
        mapContainer.style.display = 'none';
        profileDetails.innerHTML = '';
    }

    function logoutUser() {
        localStorage.removeItem('accessToken');
        currentUser = null;
        alert('You have been logged out.');
        showAuthView();
    }

    function initializeMap() {
        if (map) return;
        map = L.map('map').setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    }

    async function fetchProfile() {
        const token = localStorage.getItem('accessToken');
        if (!token) return null;
        try {
            const response = await fetch(`${API_URL}/profile`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const user = await response.json();
                currentUser = user;
                profileDetails.innerHTML = `
                    <p><strong>Username:</strong> ${user.username}</p>
                    <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>City:</strong> ${user.city || 'Not set'}</p>
                    <p><strong>Bike Model:</strong> ${user.bike_model || 'Not set'}</p>
                    <p><strong>Bio:</strong> ${user.bio || 'Not set'}</p>
                `;
                document.getElementById('update-city').value = user.city || '';
                document.getElementById('update-bike').value = user.bike_model || '';
                document.getElementById('update-bio').value = user.bio || '';
                return user;
            } else {
                logoutUser();
                return null;
            }
        } catch (error) {
            console.error('Fetch Profile Error:', error);
            return null;
        }
    }

    async function fetchAllGroups(user) {
        try {
            const response = await fetch(`${API_URL}/groups`, { method: 'GET' });
            if (!response.ok) {
                groupsList.innerHTML = '<p>Could not fetch groups.</p>';
                return;
            }
            const groups = await response.json();
            if (groups.length === 0) {
                groupsList.innerHTML = '<div class="col-12"><p>No groups found. Why not create one?</p></div>';
                return;
            }
            groupsList.innerHTML = '';
            groups.forEach(group => {
                const isMember = user && user.joined_groups.includes(group.id);
                const isCreator = user && user.username === group.creator_username;
                let membershipButton;
                if (isCreator) {
                    membershipButton = '<p class="text-muted"><em>(You are the creator)</em></p>';
                } else if (isMember) {
                    membershipButton = `<button class="btn btn-danger btn-sm leave-button" data-group-id="${group.id}">Leave</button>`;
                } else {
                    membershipButton = `<button class="btn btn-success btn-sm join-button" data-group-id="${group.id}">Join</button>`;
                }
                const groupColumn = document.createElement('div');
                groupColumn.className = 'col-md-6 col-lg-4 mb-4';
                groupColumn.innerHTML = `
                    <div class="card h-100">
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title">${group.name}</h5>
                            <p class="card-text">${group.description || 'No description.'}</p>
                            <p class="card-text"><small class="text-muted">Created by: ${group.creator_username}</small></p>
                            <div class="mt-auto">
                                ${membershipButton}
                                <button class="btn btn-secondary btn-sm details-button" data-group-id="${group.id}">View Details</button>
                            </div>
                        </div>
                    </div>
                `;
                groupsList.appendChild(groupColumn);
            });
        } catch (error) {
            console.error('Fetch Groups Error:', error);
            groupsList.innerHTML = '<p>An error occurred while fetching groups.</p>';
        }
    }

    async function fetchAllUsers() {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/users`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                ridersList.innerHTML = '<p>Could not fetch riders.</p>';
                return;
            }
            const users = await response.json();
            ridersList.innerHTML = '';
            if (users.length === 0) {
                ridersList.innerHTML = '<div class="col-12"><p>No other riders found.</p></div>';
                return;
            }
            users.forEach(user => {
                const userColumn = document.createElement('div');
                userColumn.className = 'col-md-6 col-lg-4 mb-4';
                let connectionButton = '';
                switch (user.connection_status) {
                    case 'none':
                        connectionButton = `<button class="btn btn-primary btn-sm connect-button" data-user-id="${user.id}">Add Connection</button>`;
                        break;
                    case 'sent':
                        connectionButton = `<button class="btn btn-secondary btn-sm" disabled>Request Sent</button>`;
                        break;
                    case 'accepted':
                        connectionButton = `<p class="text-success"><em>Connected</em></p>`;
                        break;
                    case 'received':
                        connectionButton = `<button class="btn btn-success btn-sm accept-button" data-user-id="${user.id}">Accept Request</button>`;
                        break;
                }
                userColumn.innerHTML = `
                    <div class="card h-100">
                        <div class="card-body">
                            <h5 class="card-title">${user.username}</h5>
                            <p class="card-text"><small class="text-muted">${user.city || 'City not specified'}</small></p>
                            <p class="card-text">${user.bike_model || 'Bike not specified'}</p>
                            ${connectionButton}
                        </div>
                    </div>
                `;
                ridersList.appendChild(userColumn);
            });
        } catch (error) {
            console.error('Fetch Users Error:', error);
            ridersList.innerHTML = '<p>An error occurred while fetching riders.</p>';
        }
    }

    async function fetchConnections() {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/connections`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            receivedRequestsList.innerHTML = data.received_requests.length ? '' : '<p>None</p>';
            data.received_requests.forEach(user => {
                receivedRequestsList.innerHTML += `<div class="d-flex justify-content-between align-items-center mb-2"><span>${user.username}</span><button class="btn btn-success btn-sm accept-button" data-user-id="${user.id}">Accept</button></div>`;
            });
            currentConnectionsList.innerHTML = data.connections.length ? '' : '<p>None</p>';
            data.connections.forEach(user => {
                currentConnectionsList.innerHTML += `<p>${user.username}</p>`;
            });
            sentRequestsList.innerHTML = data.sent_requests.length ? '' : '<p>None</p>';
            data.sent_requests.forEach(user => {
                sentRequestsList.innerHTML += `<p>${user.username}</p>`;
            });
        } catch (error) {
            console.error('Fetch Connections Error:', error);
        }
    }

    // --- EVENT LISTENERS ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.message);
                registerForm.reset();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Registration Error:', error);
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('accessToken', data.access_token);
                alert('Login successful!');
                showProfileView();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Login Error:', error);
        }
    });

    createGroupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        const name = document.getElementById('group-name').value;
        const description = document.getElementById('group-description').value;
        try {
            const response = await fetch(`${API_URL}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name, description })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.message);
                createGroupForm.reset();
                const updatedUser = await fetchProfile();
                fetchAllGroups(updatedUser);
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Create Group Error:', error);
        }
    });

    updateProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        const city = document.getElementById('update-city').value;
        const bike_model = document.getElementById('update-bike').value;
        const bio = document.getElementById('update-bio').value;
        try {
            const response = await fetch(`${API_URL}/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ city, bike_model, bio })
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.message);
                fetchProfile();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Update Profile Error:', error);
        }
    });

    profileLink.addEventListener('click', (e) => {
        e.preventDefault();
        showView('profile-container');
    });

    groupsLink.addEventListener('click', (e) => {
        e.preventDefault();
        showView('groups-container');
    });

    ridersLink.addEventListener('click', (e) => {
        e.preventDefault();
        showView('riders-container');
        fetchAllUsers();
    });

    connectionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        showView('connections-container');
        fetchConnections();
    });

    navbarLogoutButton.addEventListener('click', logoutUser);

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = chatMessageInput.value;
        if (msg && currentRoom) {
            socket.emit('message', {
                room: currentRoom,
                msg: msg,
                username: currentUser.username
            });
            chatMessageInput.value = '';
        }
    });

    backToGroupsButton.addEventListener('click', () => {
        if (currentRoom) {
            currentRoom = null;
        }
        showView('groups-container');
    });

    leaveRideButton.addEventListener('click', () => {
        showView('groups-container');
    });

    groupsList.addEventListener('click', async (e) => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        const target = e.target;
        const groupId = target.dataset.groupId;
        if (!groupId) return;

        if (target.classList.contains('join-button')) {
            try {
                const response = await fetch(`${API_URL}/groups/${groupId}/join`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    alert('Successfully joined group!');
                    const updatedUser = await fetchProfile();
                    fetchAllGroups(updatedUser);
                } else {
                    const data = await response.json();
                    alert(`Error: ${data.error}`);
                }
            } catch (error) {
                console.error('Join Error:', error);
            }
        }

        if (target.classList.contains('leave-button')) {
            try {
                const response = await fetch(`${API_URL}/groups/${groupId}/leave`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    alert('Successfully left group!');
                    const updatedUser = await fetchProfile();
                    fetchAllGroups(updatedUser);
                } else {
                    const data = await response.json();
                    alert(`Error: ${data.error}`);
                }
            } catch (error) {
                console.error('Leave Error:', error);
            }
        }

        if (target.classList.contains('details-button')) {
            try {
                const response = await fetch(`${API_URL}/groups/${groupId}`);
                const groupDetails = await response.json();

                singleGroupName.textContent = groupDetails.name;
                singleGroupDescription.textContent = groupDetails.description;
                singleGroupMembers.innerHTML = '';
                groupDetails.members.forEach(member => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item';
                    li.textContent = member.username;
                    singleGroupMembers.appendChild(li);
                });

                rideActions.innerHTML = '';
                const isCreator = currentUser.username === groupDetails.creator_username;

                if (groupDetails.active_ride_id) {
                    const joinRideButton = document.createElement('button');
                    joinRideButton.className = 'btn btn-success';
                    joinRideButton.textContent = 'Join Active Ride';
                    joinRideButton.onclick = () => {
                        rideGroupName.textContent = `Ride: ${groupDetails.name}`;
                        showView('map-container');
                        initializeMap();
                    };
                    rideActions.appendChild(joinRideButton);
                } else if (isCreator) {
                    const startRideButton = document.createElement('button');
                    startRideButton.className = 'btn btn-primary';
                    startRideButton.textContent = 'Start a New Ride';
                    startRideButton.onclick = async () => {
                        try {
                            const startResponse = await fetch(`${API_URL}/groups/${groupId}/start_ride`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
                            });
                            if (startResponse.ok) {
                                alert('Ride started! Refreshing group details.');
                                target.click();
                            } else {
                                const errorData = await startResponse.json();
                                alert(`Error: ${errorData.error}`);
                            }
                        } catch (error) {
                            console.error('Start Ride Error:', error);
                        }
                    };
                    rideActions.appendChild(startRideButton);
                }

                const room = `group_${groupId}`;
                socket.emit('join', { username: currentUser.username, room: room });
                currentRoom = room;
                showView('single-group-container');
                chatMessages.innerHTML = '';
            } catch (error) {
                console.error('Details Error:', error);
            }
        }
    });

    ridersList.addEventListener('click', async (e) => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        const target = e.target;
        const userId = target.dataset.userId;
        if (!userId) return;

        if (target.classList.contains('connect-button')) {
            try {
                const response = await fetch(`${API_URL}/connections/send/${userId}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (response.ok) {
                    alert(data.message);
                    fetchAllUsers();
                } else {
                    alert(`Error: ${data.error}`);
                }
            } catch (error) {
                console.error('Send Connection Error:', error);
            }
        }

        if (target.classList.contains('accept-button')) {
            try {
                const response = await fetch(`${API_URL}/connections/accept/${userId}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (response.ok) {
                    alert(data.message);
                    fetchAllUsers();
                } else {
                    alert(`Error: ${data.error}`);
                }
            } catch (error) {
                console.error('Accept Connection Error:', error);
            }
        }
    });

    receivedRequestsList.addEventListener('click', async (e) => {
        const token = localStorage.getItem('accessToken');
        if (!token || !e.target.classList.contains('accept-button')) return;
        const userId = e.target.dataset.userId;
        try {
            const response = await fetch(`${API_URL}/connections/accept/${userId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                alert('Connection accepted!');
                fetchConnections();
            } else {
                const data = await response.json();
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Accept Connection Error:', error);
        }
    });

    // --- INITIAL PAGE LOAD CHECK ---
    if (localStorage.getItem('accessToken')) {
        showProfileView();
    }
});