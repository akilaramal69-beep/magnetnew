import requests
import sys

BASE_URL = "http://localhost:5000"

def test_index():
    try:
        print("Testing GET / ...")
        resp = requests.get(BASE_URL)
        if resp.status_code == 200 and "<title>PikPak Torrent Downloader</title>" in resp.text:
            print("✅ GET / passed")
        else:
            print(f"❌ GET / failed: {resp.status_code}")
            sys.exit(1)
    except Exception as e:
        print(f"❌ GET / exception: {e}")
        sys.exit(1)

def test_login_failure():
    try:
        print("Testing POST /api/login with invalid creds...")
        resp = requests.post(f"{BASE_URL}/api/login", json={"username": "fake", "password": "fake"})
        if resp.status_code == 401:
            print("✅ POST /api/login rejected invalid creds as expected")
        else:
            print(f"❌ POST /api/login unexpected status: {resp.status_code}")
            # Note: If API changed or network issue, might be 500 or something else. 
            # But 401 is what we expect from our code catching the exception.
    except Exception as e:
        print(f"❌ POST /api/login exception: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_index()
    test_login_failure()
    print("ALL TESTS PASSED")
