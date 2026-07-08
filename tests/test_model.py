from erd_tool.model import PhysicalModel


def test_physical_model_serializes_name() -> None:
    assert PhysicalModel(name="warehouse").to_dict() == {"name": "warehouse"}
