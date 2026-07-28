"""
Unit tests para app/services/traffic.py (fuente única del semáforo compartido)
y para la unificación del tipo TrafficLight.

Incluye un test de snapshot de serialización que prueba que el Enum `TrafficLight`
serializa a JSON byte-idéntico a como lo hacía el viejo `Literal[str]` de
vehicle_profile.py ("green"/"yellow"/"red"), garantizando que el refactor no
cambia las respuestas de la API.
"""
from app.schemas.accreditation import TrafficLight, ProjectTrafficLight
from app.schemas.vehicle_profile import VehicleGlobalStatus
from app.services.traffic import worst_traffic_light


# ── worst_traffic_light: severidad ────────────────────────────────────────────

class TestWorstTrafficLight:
    def test_red_dominates_all(self):
        assert worst_traffic_light(["green", "yellow", "red"]) == TrafficLight.RED

    def test_yellow_beats_green(self):
        assert worst_traffic_light(["green", "yellow"]) == TrafficLight.YELLOW

    def test_all_green_returns_green(self):
        assert worst_traffic_light(["green", "green"]) == TrafficLight.GREEN

    def test_single_value(self):
        assert worst_traffic_light(["yellow"]) == TrafficLight.YELLOW

    def test_accepts_enum_members(self):
        assert worst_traffic_light(
            [TrafficLight.GREEN, TrafficLight.RED]
        ) == TrafficLight.RED

    def test_mixed_str_and_enum(self):
        assert worst_traffic_light(
            ["green", TrafficLight.YELLOW, "red"]
        ) == TrafficLight.RED


# ── worst_traffic_light: listas vacías / None / default ───────────────────────

class TestWorstTrafficLightDefaults:
    def test_empty_returns_default_none(self):
        assert worst_traffic_light([]) is None

    def test_all_none_returns_default_none(self):
        assert worst_traffic_light([None, None]) is None

    def test_none_ignored_mixed_with_value(self):
        assert worst_traffic_light([None, "green"]) == TrafficLight.GREEN

    def test_red_with_none_is_red(self):
        assert worst_traffic_light([None, "red"]) == TrafficLight.RED

    def test_empty_with_green_default(self):
        # Semántica de trabajadores: lista sin hallazgos == verde.
        assert worst_traffic_light([], default=TrafficLight.GREEN) == TrafficLight.GREEN

    def test_all_none_with_green_default(self):
        assert (
            worst_traffic_light([None, None], default=TrafficLight.GREEN)
            == TrafficLight.GREEN
        )

    def test_value_overrides_green_default(self):
        assert (
            worst_traffic_light(["red"], default=TrafficLight.GREEN) == TrafficLight.RED
        )

    def test_accepts_set_input(self):
        # Trabajadores pasan sets, no listas.
        assert (
            worst_traffic_light({TrafficLight.GREEN, TrafficLight.YELLOW},
                                default=TrafficLight.GREEN)
            == TrafficLight.YELLOW
        )


# ── Snapshot de serialización: Enum == Literal en JSON ────────────────────────

class TestTrafficLightSerialization:
    def test_enum_serializes_to_lowercase_string(self):
        # El valor del Enum es el string plano, no "TrafficLight.RED".
        assert TrafficLight.RED.value == "red"
        assert str(TrafficLight.RED.value) == "red"

    def test_vehicle_global_status_json_is_byte_identical(self):
        status = VehicleGlobalStatus(
            vehicle_id=1,
            license_plate="AB-12",
            type="camion",
            brand="Volvo",
            model="FH",
            year=2020,
            is_active=True,
            global_traffic_light=TrafficLight.RED,
        )
        expected = (
            '{"vehicle_id":1,"license_plate":"AB-12","type":"camion",'
            '"brand":"Volvo","model":"FH","year":2020,"is_active":true,'
            '"global_traffic_light":"red"}'
        )
        assert status.model_dump_json() == expected

    def test_vehicle_status_accepts_plain_string_like_the_service(self):
        # El servicio históricamente asignaba strings ("red") a estos campos;
        # con el Enum, Pydantic los coerciona y serializa idéntico.
        status = VehicleGlobalStatus(
            vehicle_id=2,
            license_plate="CD-34",
            type="auto",
            brand="Kia",
            model="Rio",
            year=None,
            is_active=True,
            global_traffic_light="green",  # string plano, como antes
        )
        assert status.global_traffic_light == TrafficLight.GREEN
        assert '"global_traffic_light":"green"' in status.model_dump_json()

    def test_vehicle_status_none_serializes_to_null(self):
        status = VehicleGlobalStatus(
            vehicle_id=3, license_plate="EF-56", type="auto",
            brand="Kia", model="Rio", year=None, is_active=True,
            global_traffic_light=None,
        )
        assert '"global_traffic_light":null' in status.model_dump_json()

    def test_worker_project_traffic_light_json(self):
        row = ProjectTrafficLight(
            project_id=7, project_name="Obra Norte", traffic_light=TrafficLight.YELLOW
        )
        assert row.model_dump_json() == (
            '{"project_id":7,"project_name":"Obra Norte","traffic_light":"yellow"}'
        )
