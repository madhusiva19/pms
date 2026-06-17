from typing import TypedDict, Optional


class Country(TypedDict):
    id: str
    name: str
    code: str
    total_employees: int
    total_branches: int


class Branch(TypedDict):
    id: str
    country_id: str
    name: str
    code: str
    total_employees: int
