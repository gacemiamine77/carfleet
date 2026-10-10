import "leaflet";

declare module "leaflet" {
  function heatLayer(
    latlngs: Array<[number, number] | [number, number, number]>,
    options?: Record<string, number | boolean | string>
  ): L.Layer;
}
