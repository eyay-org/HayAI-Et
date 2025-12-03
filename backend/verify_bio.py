import requests
import json

API_URL = "http://localhost:8000"

def login(username, password):
    response = requests.post(
        f"{API_URL}/token",
        data={"username": username, "password": password}
    )
    if response.status_code == 200:
        return response.json()
    print(f"Login failed: {response.text}")
    return None

def get_user_profile(user_id, token):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{API_URL}/users/{user_id}", headers=headers)
    return response.json()

def update_bio(user_id, bio_preset_id, token):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.put(
        f"{API_URL}/users/{user_id}/bio",
        params={"bio_preset_id": bio_preset_id},
        headers=headers
    )
    return response

def main():
    # Login as 'hayai' (default user)
    print("Logging in...")
    auth = login("hayai", "hayai123")
    if not auth:
        return

    token = auth["access_token"]
    user_id = 1  # hayai user_id is 1

    # Get current bio
    print("Fetching current profile...")
    profile = get_user_profile(user_id, token)
    print(f"Current Bio: {profile['bio']}")

    # Update bio to preset 3 ("Uzay Kaşifi 🚀")
    print("Updating bio to preset 3...")
    response = update_bio(user_id, 3, token)
    if response.status_code == 200:
        print("Update successful!")
        print(f"New Bio from response: {response.json()['bio']}")
    else:
        print(f"Update failed: {response.status_code} - {response.text}")

    # Verify update
    print("Verifying update...")
    profile = get_user_profile(user_id, token)
    print(f"Verified Bio: {profile['bio']}")

    # Revert to preset 1
    print("Reverting to preset 1...")
    update_bio(user_id, 1, token)

if __name__ == "__main__":
    main()
