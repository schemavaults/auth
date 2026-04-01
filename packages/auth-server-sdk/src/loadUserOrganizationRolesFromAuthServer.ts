export default async function loadUserOrganizationRolesFromAuthServer(
  auth_server_url: string,
) {
  const response = await fetch(`${auth_server_url}/`, {
    method: "GET",
  });

  throw new Error("Unimplemented");
}
