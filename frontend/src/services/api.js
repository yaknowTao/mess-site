const API_URL = "http://localhost:8000";

// Fetch menu items
export async function getMenu() {
  const response = await fetch(`${API_URL}/menu`);

  if (!response.ok) {
    throw new Error("Failed to fetch menu");
  }

  return response.json();
}

// Request OTP
export async function requestOtp(name, mobileNumber) {
  const response = await fetch(`${API_URL}/auth/request-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mobile_number: mobileNumber,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not request OTP");
  }

  return data;
}

// Verify OTP
export async function verifyOtp(name, mobileNumber, otp) {
  const response = await fetch(`${API_URL}/auth/verify-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mobile_number: mobileNumber,
      otp,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "OTP verification failed");
  }

  return data;
}

// Get the currently logged-in user
export async function getMe(token) {
  const response = await fetch(`${API_URL}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not verify login");
  }

  return data;
}