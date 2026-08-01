export function routeUrl(route) {
  if (window.location.protocol !== "file:") {
    return route;
  }

  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${window.location.pathname}#${normalizedRoute}`;
}

export function openRoute(route, target = "_blank") {
  window.open(routeUrl(route), target);
}
