export function seedPassword(name = 'SEED_USER_PASSWORD') {
  const password = process.env[name];
  if (typeof password !== 'string' || password.length < 12) throw new Error(`Set ${name} to a password of at least 12 characters before provisioning accounts`);
  return password;
}
