import { describe, expect, test } from "bun:test";
import loadJwksAccessPrivateKey from "./loadJwksAccessPrivateKey";

const base64url_encoded: string =
  "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2Z0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktnd2dnU2tBZ0VBQW9JQkFRRFFzNXc0a2M3b2xXUkIKWk93N2Zrc1d6bExJQXNkU2tDY0t4Q056UTZQY2ErdWJGT0UwdmdoK1N3YmJmalJNZDFnNGh5bWlpbVppMnJrZQpXTUIrcGc4Z2hUVzg4RGVIM2ttQXcxWGF2TFVjRzVFY0U0MVRLdFRtS0YrTUZCT3dwU0g0Y1VwWXVTMGwybXpzCmFmc1hyN0Y5bFlLeXF1Vjg1UkxIY2F0MzhTYnM2ZUt2QjJJVS8yY3plNGErNWh4azQ1NCtuZUFPeGZtV1F5bG8KY2VGb3R5VVZTbktPVlpxWERkY3lCRDhLeXh3bHk4M3lTRVdQT04vc3BqRjdEb3ZqeHdqdHBOTkliRFV6aVRtNwo0KzFkMHBNeGdsWVlxVG9hMXdRVEVXcitaVDJiVnI5RUxpSmcrTGEvYVppVDdDdUhoWnZJYnBYRmt5RTZJcG9PClBOWjFsZ3NsQWdNQkFBRUNnZ0VBVXpSSVJBVmRpRHlIQzh0QW96ZG1tR0VKZjlRYnd6N1ZVZVdBZktPcTRHWG0KT0ozS2EweVg5a0hUS2c3V3F1V3B0bCtzcWJDandTV1NTQmI2SjRQczQvbzN3bXZDdDloWFZZNksyL24vK29URApCWDZHQ1hJNkRzaHB6MTd4dXFzYk1BRjZzb1NoQzBaWnhxYzZBK2QzeTZtZndidUFZcHF4TWZLUGVmSWFvcmlqCnZjdkZ6OEdPVDFqOHVvSlAxSkoxckxSNURyczRUVVQ5U2MzTG9MUE9TLy82TXMyNzYrVEJ4RVZ3MGtoREwxdG4KK0Z1bTkvQUJGdmRBd3NpTzlBUGMwMXhoSG15Mjd5SXdaY0JqVlE5YkQ4dXg4VG1MV2VNVk8xSWlZdFA0bW5GMgpRMEtCS2g0Vk43eS9iMWdpK3BxaDFoNU9aaVRzUHZ5WHJoQzRoUGhRd1FLQmdRRHhQd1FmSzBCZHlUamdEYmV1CjFydXUvb251cXdxeWkramRxVDl6UGxKU3dGZGR4R0pwa1JjNnhzaFVCMHpOUHFGWU9lcEJtcHBZU3g1TEVwNDAKbXhoY0hidVZJR0ZDSlFrSk1BRldhVm05b2xQSjU2MExvS2hROU4yMGlQTHMrUFRpWTljMUR5Mkp6c2Yxd2pvMQo4Y2lkZy90azhaUGNIVUlNeXN3Ry9xUmV6d0tCZ1FEZGR4SnVzZDEzN1Q3dFhCRUM0dkcvNmpvak5jSEs5RzZTCmRlRGJ3cDZ0cG53dytzaVFQanhsSmdlQ0Q2SFhOeUZ6elZhbmJaTW5kdmNnOEx3SzBMcHNuN0dMOXE2MzF1cDcKWnpHcTk3emVxUHRzdGgvTkYyOUwwd25nNU5ocU0rdC9QWWVqVzlXSFZscU02UHF0SWNFYW9vSXlNZ1pORWRFZgpsRC85ejlLVHl3S0JnUUNaanpjY2IvZUV1elVNeVM2R2lBRG5udlpGaVhKQnZIVDV3MlcwQVpOOVFSbGJna255ClVIeXMyU05pK1ZLVndxd0k4TFNBRmR6eEhyK2xvYkE2WkE3WmM4T1haUWtEaFhkKzlhT2tVV0xpSnBXWEMzVkcKMVhqT0wwK0FQendDUTJYOVJQZ1R1aG1PZ3FVZGRnaC9sZXZROTlYcHB5d3JEQ1NpNStOL0FFKzRXUUtCZ1FDTgpQRG1xRkk1N3cvWmtvMWxKOFBkaGYvdlJwcC9QVWZFT1FGVEZjYW1HYnUwMncwaVRETTJ4Wi81VHlLcGF1Uk1CCmFndUFQUllpamZEdXRmZ0dJYlV5UHVtWXJCb2lyZEhlSHlLQ3VQbGZPbjhWaGxSamxEVnJNc3hTK3o2MUJDV0UKZ1BYMmpVTnd5dloyZE1JaEZheXowcjJiUzJIUFZyUjZJaTVwTEZkTDN3S0JnQUhvZ1JKWHJPRjM3aEovM283RApOMnZPNGI2bVJBKy9GM0xqU2d3ZTRKVk9VSVNMaE82a0FzV0FML2lDYkhSNitzQk02TU1VN0tvU2NuQmsyNnBOCnozOGFSMWs0djBZQzVmUEZxN0xac1N6UHFMVmliM1Z5cTN1QkJDaXZobW1aVGVMYTNMTmJ5cUhpUmNtWUJtUkQKeFFHYytyOUZFU1FkTlJnUlhtZG5kaU9uCi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0";

const PEM_format: string = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDQs5w4kc7olWRB
ZOw7fksWzlLIAsdSkCcKxCNzQ6Pca+ubFOE0vgh+SwbbfjRMd1g4hymiimZi2rke
WMB+pg8ghTW88DeH3kmAw1XavLUcG5EcE41TKtTmKF+MFBOwpSH4cUpYuS0l2mzs
afsXr7F9lYKyquV85RLHcat38Sbs6eKvB2IU/2cze4a+5hxk454+neAOxfmWQylo
ceFotyUVSnKOVZqXDdcyBD8Kyxwly83ySEWPON/spjF7DovjxwjtpNNIbDUziTm7
4+1d0pMxglYYqToa1wQTEWr+ZT2bVr9ELiJg+La/aZiT7CuHhZvIbpXFkyE6IpoO
PNZ1lgslAgMBAAECggEAUzRIRAVdiDyHC8tAozdmmGEJf9Qbwz7VUeWAfKOq4GXm
OJ3Ka0yX9kHTKg7WquWptl+sqbCjwSWSSBb6J4Ps4/o3wmvCt9hXVY6K2/n/+oTD
BX6GCXI6Dshpz17xuqsbMAF6soShC0ZZxqc6A+d3y6mfwbuAYpqxMfKPefIaorij
vcvFz8GOT1j8uoJP1JJ1rLR5Drs4TUT9Sc3LoLPOS//6Ms276+TBxEVw0khDL1tn
+Fum9/ABFvdAwsiO9APc01xhHmy27yIwZcBjVQ9bD8ux8TmLWeMVO1IiYtP4mnF2
Q0KBKh4VN7y/b1gi+pqh1h5OZiTsPvyXrhC4hPhQwQKBgQDxPwQfK0BdyTjgDbeu
1ruu/onuqwqyi+jdqT9zPlJSwFddxGJpkRc6xshUB0zNPqFYOepBmppYSx5LEp40
mxhcHbuVIGFCJQkJMAFWaVm9olPJ560LoKhQ9N20iPLs+PTiY9c1Dy2Jzsf1wjo1
8cidg/tk8ZPcHUIMyswG/qRezwKBgQDddxJusd137T7tXBEC4vG/6jojNcHK9G6S
deDbwp6tpnww+siQPjxlJgeCD6HXNyFzzVanbZMndvcg8LwK0Lpsn7GL9q631up7
ZzGq97zeqPtsth/NF29L0wng5NhqM+t/PYejW9WHVlqM6PqtIcEaooIyMgZNEdEf
lD/9z9KTywKBgQCZjzccb/eEuzUMyS6GiADnnvZFiXJBvHT5w2W0AZN9QRlbgkny
UHys2SNi+VKVwqwI8LSAFdzxHr+lobA6ZA7Zc8OXZQkDhXd+9aOkUWLiJpWXC3VG
1XjOL0+APzwCQ2X9RPgTuhmOgqUddgh/levQ99XppywrDCSi5+N/AE+4WQKBgQCN
PDmqFI57w/Zko1lJ8Pdhf/vRpp/PUfEOQFTFcamGbu02w0iTDM2xZ/5TyKpauRMB
aguAPRYijfDutfgGIbUyPumYrBoirdHeHyKCuPlfOn8VhlRjlDVrMsxS+z61BCWE
gPX2jUNwyvZ2dMIhFayz0r2bS2HPVrR6Ii5pLFdL3wKBgAHogRJXrOF37hJ/3o7D
N2vO4b6mRA+/F3LjSgwe4JVOUISLhO6kAsWAL/iCbHR6+sBM6MMU7KoScnBk26pN
z38aR1k4v0YC5fPFq7LZsSzPqLVib3Vyq3uBBCivhmmZTeLa3LNbyqHiRcmYBmRD
xQGc+r9FESQdNRgRXmdndiOn
-----END PRIVATE KEY-----`;

const DEBUG: boolean = true;

describe("loadJwksAccessPrivateKey", () => {
  test("can load crypto key from base64url-encoded environment variable", async () => {
    let errorThrown: boolean = false;
    try {
      const crypto_key = await loadJwksAccessPrivateKey({
        SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY: base64url_encoded,
        NODE_ENV: process.env.NODE_ENV,
      });
      if (!(crypto_key instanceof CryptoKey)) {
        throw new Error("Result is not an instance of crypto key!");
      }
    } catch (e: unknown) {
      if (DEBUG) {
        console.error(e);
      }
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("can load crypto key from PEM-format environment variable", async () => {
    let errorThrown: boolean = false;
    try {
      const crypto_key = await loadJwksAccessPrivateKey({
        SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY: PEM_format,
        NODE_ENV: process.env.NODE_ENV,
      });
      if (!(crypto_key instanceof CryptoKey)) {
        throw new Error("Result is not an instance of crypto key!");
      }
    } catch (e: unknown) {
      if (DEBUG) {
        console.error(e);
      }
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("an error is thrown when not passing a random string instead of a real key", async () => {
    let errorThrown: boolean = false;
    try {
      const crypto_key = await loadJwksAccessPrivateKey({
        SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY:
          "blahblahblahblahblahblahblahblah",
        NODE_ENV: process.env.NODE_ENV,
      });
      if (!(crypto_key instanceof CryptoKey)) {
        throw new Error("Result is not an instance of crypto key!");
      }
    } catch (e: unknown) {
      void e;
      errorThrown = true;
    }
    expect(errorThrown).toBeTrue();
  });
});
